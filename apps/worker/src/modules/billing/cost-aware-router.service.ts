import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { metrics } from '@opentelemetry/api';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';

export type CostAwareTaskPriority = 'low' | 'normal' | 'high';

export type CostAwareDecideInput = {
  companyId: string;
  /** L1 + rollout effective for this company */
  effective: boolean;
  /** 1 = CEO / executive tier; higher = deeper execution */
  agentLevel?: number | null;
  /** 0–1 heuristic complexity (optional) */
  complexityScore?: number | null;
  /** When cost-aware is off or ineffective */
  baselinePriority?: CostAwareTaskPriority;
};

type BudgetRow = {
  scope?: string;
  totalAmount?: string;
  usedAmount?: string;
};

/**
 * W14：成本感知任务优先级（供 `billing.modelRouter.resolve` 的 `taskPriority` 使用）。
 * 与 {@link LlmKeyResolverService} / {@link CollaborationLlmBridgeService} 组合使用；不改变 Billing 入账路径。
 *
 * 门控：全局 `COST_AWARE_ROUTING_ENABLED` + 调用方传入 `effective`（通常来自 {@link L1FeatureFlagService.isCostAwareRoutingEffective}）。
 */
@Injectable()
export class CostAwareRouterService {
  private readonly logger = new Logger(CostAwareRouterService.name);
  private readonly meter = metrics.getMeter('foundry.cost');
  private readonly decisionCounter = this.meter.createCounter('foundry.cost.aware.decisions', {
    description: 'Cost-aware routing decisions by resulting priority',
  });
  private readonly downgradeCounter = this.meter.createCounter('foundry.cost.aware.downgrades', {
    description: 'Count of priority downgrades vs baseline',
  });
  private readonly savingsCounter = this.meter.createCounter('foundry.cost.aware.savings', {
    description: 'Estimated fractional savings units when choosing cheaper priority tier',
  });
  private readonly latencyHistogram = this.meter.createHistogram('foundry.latency.seconds', {
    unit: 's',
    description: 'Cost-aware decision wall time (for P95 dashboards / correlation)',
  });

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy | undefined,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private priorityRank(p: CostAwareTaskPriority): number {
    if (p === 'high') return 2;
    if (p === 'normal') return 1;
    return 0;
  }

  private rankToPriority(r: number): CostAwareTaskPriority {
    if (r >= 2) return 'high';
    if (r >= 1) return 'normal';
    return 'low';
  }

  private async fetchCompanyUtilization(companyId: string): Promise<number | null> {
    if (!this.apiRpc) return null;
    try {
      const rows = await firstValueFrom(
        this.apiRpc
          .send<BudgetRow[]>('billing.budgets.list', {
            companyId,
            actor: this.workerActor(),
          } as Record<string, unknown>)
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
      const list = Array.isArray(rows) ? rows : [];
      const company = list.find((r) => String(r?.scope ?? '') === 'company');
      if (!company) return null;
      const total = parseFloat(String(company.totalAmount ?? '0'));
      const used = parseFloat(String(company.usedAmount ?? '0'));
      if (!Number.isFinite(total) || total <= 0) return used > 0 ? 1 : 0;
      return Math.min(1, Math.max(0, used / total));
    } catch (e: unknown) {
      this.logger.debug('cost_aware.budgets_list_failed', {
        companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * 决策 `taskPriority`：默认不改变现有行为（effective=false 或全局关 → 返回 baseline）。
   */
  async decideTaskPriority(input: CostAwareDecideInput): Promise<CostAwareTaskPriority> {
    const t0 = Date.now();
    const baseline: CostAwareTaskPriority =
      input.baselinePriority ??
      (input.agentLevel === 1 || input.agentLevel === 0 ? 'high' : 'normal');

    if (!this.config.isCostAwareRoutingEnabled() || !input.effective) {
      this.decisionCounter.add(1, { priority: baseline, gated: 'true' });
      this.latencyHistogram.record((Date.now() - t0) / 1000, { phase: 'decide', gated: 'true' });
      return baseline;
    }

    const thr = this.config.getCostAwareBudgetThreshold();
    const util = await this.fetchCompanyUtilization(input.companyId);
    const complexity = typeof input.complexityScore === 'number' && Number.isFinite(input.complexityScore)
      ? Math.min(1, Math.max(0, input.complexityScore))
      : 0.5;

    const isCeoTier = input.agentLevel === 1 || input.agentLevel === 0;
    let chosen = baseline;

    if (util == null) {
      chosen = baseline;
    } else if (isCeoTier) {
      if (util < thr) {
        chosen = this.rankToPriority(Math.max(this.priorityRank(baseline), 2));
      } else if (util < 0.95) {
        chosen = this.rankToPriority(Math.max(this.priorityRank(baseline), 1));
      } else {
        chosen = 'normal';
      }
    } else {
      if (util >= thr) {
        chosen = 'low';
      } else if (complexity < 0.35 && util >= thr * 0.75) {
        chosen = 'low';
      } else if (complexity < 0.25) {
        chosen = 'low';
      } else {
        chosen = this.rankToPriority(Math.max(this.priorityRank(baseline), 1));
      }
    }

    const downgraded = this.priorityRank(chosen) < this.priorityRank(baseline);
    if (downgraded) {
      this.downgradeCounter.add(1, { from: baseline, to: chosen });
      this.savingsCounter.add(1, { from: baseline, to: chosen });
    }
    this.decisionCounter.add(1, { priority: chosen, gated: 'false' });
    this.latencyHistogram.record((Date.now() - t0) / 1000, { phase: 'decide', gated: 'false' });
    return chosen;
  }
}
