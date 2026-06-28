import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';
import type {
  CompanyHeartbeatContext,
  CompanyPlan,
  CompanyReviewResult,
  CompanyStateSnapshot,
} from './dto/company-heartbeat-context.dto.js';

@Injectable()
export class CompanyStateService {
  constructor(
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    private readonly monitoring: MonitoringService,
  ) {}

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }

  private numberLike(v: unknown, fallback = 0): number {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number.parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  }

  private pickListCount(list: { total?: unknown; items?: unknown[] } | null | undefined): number {
    const t = this.numberLike(list?.total, Number.NaN);
    if (Number.isFinite(t) && t >= 0) return t;
    return Array.isArray(list?.items) ? list!.items!.length : 0;
  }

  async captureSnapshot(ctx: CompanyHeartbeatContext): Promise<CompanyStateSnapshot> {
    const actor = this.actor();
    const [company, budgets, pendingApprovals, organization] = await Promise.all([
      this.rpc<{ name?: string }>('companies.findOne', {
        companyId: ctx.companyId,
        actor,
        id: ctx.companyId,
      }).catch(() => ({ name: 'Company' })),
      this.rpc<{ items?: Array<Record<string, unknown>> }>('billing.budgets.list', {
        companyId: ctx.companyId,
        actor,
        page: 1,
        pageSize: 20,
      }).catch(() => ({ items: [] })),
      this.rpc<Array<Record<string, unknown>>>('approval.listPending', {
        companyId: ctx.companyId,
        actor,
        limit: 100,
      }).catch(() => []),
      this.rpc<{ nodes?: unknown[] }>('organization.tree', {
        companyId: ctx.companyId,
        actor,
      }).catch(() => ({ nodes: [] })),
    ]);

    const [pending, inProgress, review, blocked, completed] = await Promise.all([
      this.rpc<{ total?: number; items?: unknown[] }>('tasks.findAll', {
        companyId: ctx.companyId,
        actor,
        status: 'pending',
        page: 1,
        pageSize: 1,
      }).catch(() => ({ items: [] })),
      this.rpc<{ total?: number; items?: unknown[] }>('tasks.findAll', {
        companyId: ctx.companyId,
        actor,
        status: 'in_progress',
        page: 1,
        pageSize: 1,
      }).catch(() => ({ items: [] })),
      this.rpc<{ total?: number; items?: unknown[] }>('tasks.findAll', {
        companyId: ctx.companyId,
        actor,
        status: 'review',
        page: 1,
        pageSize: 1,
      }).catch(() => ({ items: [] })),
      this.rpc<{ total?: number; items?: unknown[] }>('tasks.findAll', {
        companyId: ctx.companyId,
        actor,
        status: 'blocked',
        page: 1,
        pageSize: 1,
      }).catch(() => ({ items: [] })),
      this.rpc<{ total?: number; items?: unknown[] }>('tasks.findAll', {
        companyId: ctx.companyId,
        actor,
        status: 'completed',
        page: 1,
        pageSize: 1,
      }).catch(() => ({ items: [] })),
    ]);

    const budgetItems = budgets.items ?? [];
    let remaining = 0;
    let warningThreshold = 0;
    for (const b of budgetItems) {
      remaining += this.numberLike((b as any)?.remaining, 0);
      warningThreshold += this.numberLike((b as any)?.warningThreshold, 0);
    }

    const snapshot: CompanyStateSnapshot = {
      companyId: ctx.companyId,
      tickAt: ctx.tickAt,
      triggerSource: ctx.triggerSource,
      capturedAt: new Date().toISOString(),
      companyName: company.name || 'Company',
      budget: {
        remaining,
        warningThreshold,
        totalBudgetCount: budgetItems.length,
      },
      tasks: {
        pending: this.pickListCount(pending),
        inProgress: this.pickListCount(inProgress),
        review: this.pickListCount(review),
        blocked: this.pickListCount(blocked),
        completed: this.pickListCount(completed),
      },
      approvals: {
        pending: pendingApprovals.length,
      },
      organization: {
        nodeCount: (organization.nodes ?? []).length,
      },
      summary: {
        pendingRisks:
          this.pickListCount(blocked) + (this.pickListCount(review) > 5 ? 1 : 0),
        pendingApprovals: pendingApprovals.length,
        activeGoals: this.pickListCount(pending) + this.pickListCount(inProgress),
      },
    };

    const version = String(Date.now());
    const saved = await this.rpc('companies.snapshot.save', {
      companyId: ctx.companyId,
      actor,
      version,
      snapshot,
    }).catch(() => null);
    if (!saved) {
      // Compatibility fallback: keep memory trace until snapshot table is fully rolled out.
      await this.rpc('memory.entries.store', {
        companyId: ctx.companyId,
        actor,
        data: {
          namespace: 'company_runtime:snapshots',
          collectionLabel: `heartbeat:${ctx.tickAt}`,
          sourceType: 'summary',
          content: JSON.stringify({
            tickAt: snapshot.tickAt,
            triggerSource: snapshot.triggerSource,
            summary: snapshot.summary,
          }),
          metadata: { snapshot, version },
        },
      }).catch(() => undefined);
    }
    this.monitoring.incCompanySnapshotCaptured();
    return snapshot;
  }

  async updateSnapshot(
    ctx: CompanyHeartbeatContext,
    review: CompanyReviewResult,
    plan: CompanyPlan,
  ): Promise<void> {
    const actor = this.actor();
    await this.rpc('companies.snapshot.getLatest', {
      companyId: ctx.companyId,
      actor,
    })
      .then(async (latest: any) => {
        const baseSnapshot =
          latest && latest.snapshot && typeof latest.snapshot === 'object' ? latest.snapshot : {};
        const mergedSnapshot = {
          ...baseSnapshot,
          review,
          plan,
          lastUpdatedAt: new Date().toISOString(),
        };
        await this.rpc('companies.snapshot.save', {
          companyId: ctx.companyId,
          actor,
          version: String(Date.now()),
          snapshot: mergedSnapshot,
        });
      })
      .catch(async () => {
        await this.rpc('memory.entries.store', {
          companyId: ctx.companyId,
          actor,
          data: {
            namespace: 'company_runtime:state_updates',
            collectionLabel: `heartbeat:${ctx.tickAt}`,
            sourceType: 'summary',
            content: `health=${review.healthScore}; mode=${plan.dispatchMode}`,
            metadata: {
              review,
              plan,
              tickAt: ctx.tickAt,
            },
          },
        }).catch(() => undefined);
      });
  }
}
