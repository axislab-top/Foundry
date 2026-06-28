import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { TenantContextService } from '@service/tenant';
import { trace } from '@opentelemetry/api';
import type { DataSource } from 'typeorm';
import { firstValueFrom, timeout } from 'rxjs';
import { RUNNER_RPC_CLIENT } from '../../common/runner/runner-rpc.constants.js';
import type { MemorySourceType } from '../memory/entities/memory-entry.entity.js';
import { MemoryService } from '../memory/services/memory.service.js';
import { DashboardBillingService } from '../billing/services/dashboard-billing.service.js';
import {
  computeWarmPoolHealth,
  countWarmPoolIdleSlots,
} from './company-workspace-metrics.util.js';
import type { CompanyWorkspaceMetrics } from './company-workspace-metrics.types.js';
import { ApprovalService } from '../approval/services/approval.service.js';
import { CompanyRuntimePreferenceService } from '../companies/services/company-runtime-preference.service.js';
import type { CompanyRuntimeKind } from '../companies/entities/company-runtime-preference.entity.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class CompanySpaceService {
  private readonly logger = new Logger(CompanySpaceService.name);

  constructor(
    @Inject(RUNNER_RPC_CLIENT) private readonly runner: ClientProxy,
    private readonly memory: MemoryService,
    private readonly tenantContext: TenantContextService,
    private readonly dashboardBilling: DashboardBillingService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly approval: ApprovalService,
    private readonly runtimePreference: CompanyRuntimePreferenceService,
  ) {}

  private actorIsPlatformAdmin(actor: Actor): boolean {
    return Boolean(actor?.roles?.some((r) => r === 'admin' || r === 'superadmin'));
  }

  private actorIsRunnerSystem(actor: Actor): boolean {
    return Boolean(actor?.roles?.some((r) => r === 'system'));
  }

  private parseRunnerRuntimeProfile(runnerRaw: Record<string, unknown>): {
    clusterDefaultRuntimeKind: CompanyRuntimeKind;
    gvisorRuntimeClassName: string;
    firecrackerRuntimeClassName: string | null;
    firecrackerPlacementConfigured: boolean;
  } {
    const rp = runnerRaw.runtimeProfile as Record<string, unknown> | undefined;
    if (!rp || typeof rp !== 'object') {
      return {
        clusterDefaultRuntimeKind: 'gvisor',
        gvisorRuntimeClassName: String(runnerRaw.gvisorRuntimeClass ?? 'gvisor'),
        firecrackerRuntimeClassName: null,
        firecrackerPlacementConfigured: false,
      };
    }
    const gvisor =
      (typeof rp?.gvisorRuntimeClassName === 'string' && rp.gvisorRuntimeClassName) ||
      (typeof runnerRaw.gvisorRuntimeClass === 'string' && runnerRaw.gvisorRuntimeClass) ||
      'gvisor';
    const fcRaw = rp?.firecrackerRuntimeClassName;
    const firecrackerRuntimeClassName =
      typeof fcRaw === 'string' && fcRaw.trim() ? fcRaw.trim() : null;
    const clusterDefaultRuntimeKind: CompanyRuntimeKind =
      rp?.clusterDefaultRuntimeKind === 'firecracker' ? 'firecracker' : 'gvisor';
    const firecrackerPlacementConfigured = Boolean(rp?.firecrackerPlacementConfigured);
    return {
      clusterDefaultRuntimeKind,
      gvisorRuntimeClassName: gvisor,
      firecrackerRuntimeClassName,
      firecrackerPlacementConfigured,
    };
  }

  private runnerTimeoutMs(): number {
    const raw = process.env.API_RUNNER_RPC_TIMEOUT_MS;
    const n = raw ? Number.parseInt(raw, 10) : 45_000;
    return Number.isFinite(n) && n >= 3000 ? Math.min(120_000, n) : 45_000;
  }

  private extractRunnerClientError(e: unknown): { status?: number; message?: string } | null {
    if (!e || typeof e !== 'object') return null;
    const anyE = e as Record<string, unknown>;
    const inner = (anyE.err ?? anyE.error ?? anyE.response ?? e) as Record<string, unknown>;
    const statusRaw = inner?.status ?? inner?.statusCode;
    const status = typeof statusRaw === 'number' ? statusRaw : Number(statusRaw);
    const message =
      typeof inner?.message === 'string'
        ? inner.message
        : typeof anyE.message === 'string'
          ? anyE.message
          : undefined;
    if (Number.isFinite(status) && status >= 400) {
      return { status, message };
    }
    return null;
  }

  private async sendRunner<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    const ms = this.runnerTimeoutMs();
    try {
      return await firstValueFrom(this.runner.send<T>(pattern, payload).pipe(timeout(ms)));
    } catch (e: unknown) {
      const extracted = this.extractRunnerClientError(e);
      if (extracted?.status === 403) {
        throw new ForbiddenException({ message: extracted.message ?? 'Forbidden' });
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn({ pattern, msg });
      throw new RpcException({ status: 502, message: `runner_rpc_failed: ${msg}` });
    }
  }

  async list(actor: Actor, companyIds?: string[]) {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    return this.sendRunner<Record<string, unknown>>('runner.companySpace.list', {
      companyIds: companyIds ?? undefined,
    });
  }

  async getStatus(actor: Actor, companyId: string) {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    return this.sendRunner<Record<string, unknown>>('runner.companySpace.getStatus', {
      companyId,
    });
  }

  /**
   * P18：公司空间运营仪表盘（Warm pool 健康度 + 快照恢复统计 + 计费趋势）。
   * Runner 指标经 RPC；计费与 `audit_logs` 在 `runWithCompanyId(companyId)` 下查询以满足 RLS / 租户过滤。
   */
  async getWorkspaceMetrics(actor: Actor, companyId: string): Promise<CompanyWorkspaceMetrics> {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      this.logger.log({
        msg: 'company_space_metrics_view',
        companyId,
        audit: { action: 'company_space_metrics_view', foundry_company_space_view: true },
      });

      const [runnerRaw, costTrend, restoreAudit, companyStoredKind] = await Promise.all([
        this.sendRunner<Record<string, unknown>>('runner.companySpace.getStatus', { companyId }),
        this.dashboardBilling.getDailyCostTrend(companyId, 7),
        this.fetchRestoreAuditStats(companyId),
        this.runtimePreference.getStoredKind(companyId),
      ]);

      const wp = runnerRaw.warmPool as Record<string, unknown> | undefined;
      const idleJobs = (wp?.idleJobs as CompanyWorkspaceMetrics['warmPool']['idleJobs']) ?? [];
      const target = typeof wp?.targetIdleJobs === 'number' ? wp.targetIdleJobs : Number(wp?.targetIdleJobs) || 0;
      const enabled = Boolean(wp?.enabled);
      const currentIdle = countWarmPoolIdleSlots(idleJobs);
      const health = computeWarmPoolHealth({ enabled, targetIdleJobs: target, currentIdle });

      const snaps = runnerRaw.snapshots as Record<string, unknown> | undefined;
      const latest = snaps?.latest as Record<string, unknown> | null | undefined;
      let latestReady: boolean | null = null;
      if (latest && typeof latest.readyToUse === 'boolean') {
        latestReady = latest.readyToUse;
      }

      const rp = this.parseRunnerRuntimeProfile(runnerRaw);
      const clusterDefaultRuntimeKind = rp.clusterDefaultRuntimeKind;
      const effectiveRuntimeKind: CompanyRuntimeKind =
        companyStoredKind ?? clusterDefaultRuntimeKind;
      const effectiveRuntimeClassName =
        effectiveRuntimeKind === 'firecracker' && rp.firecrackerRuntimeClassName
          ? rp.firecrackerRuntimeClassName
          : rp.gvisorRuntimeClassName;

      this.recordCompanySpaceViewOtel(companyId, effectiveRuntimeClassName);

      return {
        companyId,
        execMode: String(runnerRaw.execMode ?? 'unknown'),
        namespace: String(runnerRaw.namespace ?? ''),
        warmPool: {
          enabled,
          currentIdle,
          target,
          health,
          healthColor: health,
          reconcileIntervalMs: typeof wp?.reconcileIntervalMs === 'number' ? wp.reconcileIntervalMs : undefined,
          effectiveReconcileTimerMs:
            typeof wp?.effectiveReconcileTimerMs === 'number' ? wp.effectiveReconcileTimerMs : undefined,
          eventDrivenWarmPool: typeof wp?.eventDrivenWarmPool === 'boolean' ? wp.eventDrivenWarmPool : undefined,
          lastReconcileAt: (wp?.lastReconcileAt as string | null) ?? null,
          idleJobCount: idleJobs.length,
          idleJobs,
        },
        snapshots: {
          total: typeof snaps?.count === 'number' ? snaps.count : Number(snaps?.count) || 0,
          successRate: restoreAudit.successRate,
          lastRestoreAt: restoreAudit.lastRestoreAt,
          latestSnapshotName: typeof latest?.name === 'string' ? latest.name : null,
          latestSnapshotReadyToUse: latestReady,
        },
        costTrend,
        runtime: {
          clusterDefaultRuntimeKind,
          companyStoredKind,
          effectiveRuntimeKind,
          gvisorRuntimeClassName: rp.gvisorRuntimeClassName,
          firecrackerRuntimeClassName: rp.firecrackerRuntimeClassName,
          firecrackerPlacementConfigured: rp.firecrackerPlacementConfigured,
        },
      };
    });
  }

  /**
   * Runner 内部 RPC：读取租户覆盖（无行则 null）。须在 RLS 租户上下文中调用。
   */
  async getRunnerRuntimeKind(actor: Actor, companyId: string) {
    if (!this.actorIsRunnerSystem(actor) && !this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const storedRuntimeKind = await this.runtimePreference.getStoredKind(companyId);
      return { storedRuntimeKind };
    });
  }

  /**
   * P19：申请切换租户 RuntimeClass（审批通过后经 Approval 钩子落库）。
   */
  async requestRuntimeClassChange(
    actor: Actor,
    companyId: string,
    requestedKind: 'gvisor' | 'firecracker' | 'inherit',
  ) {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const previousStored = await this.runtimePreference.getStoredKind(companyId);
      const created = await this.approval.create(companyId, {
        actionType: 'company.runtime_class.change',
        riskLevel: requestedKind === 'firecracker' ? 'L3' : 'L2',
        context: {
          requestedKind,
          previousStored,
        },
        createdBy: actor.id,
      });
      return {
        approvalRequestId: created.id,
        status: created.status,
        actionType: created.actionType,
      };
    });
  }

  private recordCompanySpaceViewOtel(companyId: string, runtimeClassName: string): void {
    const tracer = trace.getTracer('foundry-api-company-space', '1.0.0');
    const span = tracer.startSpan('foundry.company_space_view');
    span.setAttribute('foundry.company_id', companyId);
    span.setAttribute('foundry.runtime_class', runtimeClassName);
    span.end();
  }

  private async fetchRestoreAuditStats(companyId: string): Promise<{
    successRate: number | null;
    lastRestoreAt: string | null;
  }> {
    const rows = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300)::int AS ok,
        MAX(created_at) FILTER (WHERE status_code >= 200 AND status_code < 300) AS last_ok
      FROM audit_logs
      WHERE company_id = $1::uuid
        AND method = 'POST'
        AND path ILIKE '%company-space%restore%'
        AND created_at > NOW() - INTERVAL '90 days'
      `,
      [companyId],
    );
    const row = rows[0] as { total?: number; ok?: number; last_ok?: Date | null } | undefined;
    const total = row?.total ?? 0;
    const ok = row?.ok ?? 0;
    const successRate = total > 0 ? ok / total : null;
    const lastRestoreAt =
      row?.last_ok instanceof Date ? row.last_ok.toISOString() : row?.last_ok ? String(row.last_ok) : null;
    return { successRate, lastRestoreAt };
  }

  async restoreFromSnapshot(actor: Actor, companyId: string, volumeSnapshotName: string) {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    return this.tenantContext.runWithCompanyId(companyId, () =>
      this.sendRunner<Record<string, unknown>>('runner.companySpace.restoreFromSnapshot', {
        companyId,
        volumeSnapshotName,
      }),
    );
  }

  async exportCompany(actor: Actor, companyId: string) {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    return this.sendRunner<Record<string, unknown>>('runner.companySpace.exportCompany', {
      companyId,
    });
  }

  async importMemoryBundle(actor: Actor, targetCompanyId: string, bundle: Record<string, unknown>) {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    return this.tenantContext.runWithCompanyId(targetCompanyId, () =>
      this.memory.importMigrationBundle({
        targetCompanyId,
        actor,
        bundle: bundle as {
          formatVersion: string;
          entries: Array<{
            namespace: string;
            collectionLabel?: string | null;
            content: string;
            summary?: string | null;
            metadata?: Record<string, unknown> | null;
            sourceType: MemorySourceType;
            sourceRef?: string | null;
            isSensitive?: boolean;
          }>;
        },
      }),
    );
  }
}
