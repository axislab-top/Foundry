import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { ConfigService } from '../../common/config/config.service.js';
import { DashboardService as TasksDashboardService } from '../tasks/services/dashboard.service.js';
import { DashboardBillingService } from '../billing/services/dashboard-billing.service.js';
import { Company } from '../companies/entities/company.entity.js';
import { LlmModel } from '../llm-models/entities/llm-model.entity.js';
import { LlmKey } from '../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../llm-keys/entities/llm-key-daily-usage.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../templates/entities/company-marketplace-agent-key-assignment.entity.js';

export interface PlatformOverviewStats {
  totalCompanies: number;
  sumInProgress: number;
  sumPending: number;
  sumOverdue: number;
  sumAgentsTotal: number;
  budgetUtilization: number;
  todayCost: number;
  completionRate: number;
  systemHealth: number;
  sparkToken24h: number[];
  sparkToken7d: number[];
  sparkCreation7d: number[];
  sparkAutonomy: number[];
}

export interface CeoOpsMetrics {
  interactiveQueueLength: number | null;
  interactiveQueueLatencyP95Ms: number | null;
  interactiveDlq24h: number | null;
  llmPrepCacheHitRatio: number | null;
  fastpathHitRatio: number | null;
  replyP95Seconds: number | null;
  /** W14：成本/延迟/Graph 命中（Prometheus 无数据时为 null；卡片桩） */
  costAwareSavings24h: number | null;
  latencyP95Seconds: number | null;
  memoryGraphHybridHitRate24h: number | null;
}

export interface CeoPreloadHealth {
  preloadHitRatio24h: number | null;
  preloadHitRatio7d: number | null;
  trend24h: number[];
  trend7d: number[];
  distribution: { success: number; fail: number; skip: number };
  durationMs: { p50: number | null; p95: number | null };
  topFailRooms: Array<{ roomId: string; fails: number }>;
}

export interface ModelPoolHealthTopItem {
  id: string;
  modelName: string;
  provider?: string;
  remainingPercent: number;
}

export interface ModelPoolHealthSlice {
  total: number;
  active: number;
  assignments: number;
  todayFailover: number | null;
  lowestRemainingPercent: number | null;
  topLowKeys: ModelPoolHealthTopItem[];
}

export interface ModelPoolHealth {
  llm: ModelPoolHealthSlice;
  embedding: ModelPoolHealthSlice;
}

interface Actor {
  id: string;
  roles?: string[];
}

function makeFakeSeries(seed: number, count: number): number[] {
  // MVP: deterministic-ish placeholder series until time-series endpoints are wired.
  const base = Math.max(0, seed);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 2) * 0.12 + Math.cos(i / 3) * 0.08;
    const jitter = (i % 3) * 0.03;
    out.push(base * (1 + wave + jitter));
  }
  return out;
}

function computeCompletionRate(taskSummary: any): number {
  if (!taskSummary) return 0;
  const done = taskSummary.taskCountsByStatus?.completed ?? 0;
  const denom =
    (taskSummary.taskCountsByStatus?.completed ?? 0) +
    (taskSummary.taskCountsByStatus?.in_progress ?? 0) +
    (taskSummary.taskCountsByStatus?.pending ?? 0) +
    (taskSummary.taskCountsByStatus?.review ?? 0);
  return denom > 0 ? done / denom : 0;
}

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectRepository(LlmKey) private readonly llmKeyRepo: Repository<LlmKey>,
    @InjectRepository(LlmKeyDailyUsage) private readonly llmDailyUsageRepo: Repository<LlmKeyDailyUsage>,
    @InjectRepository(LlmModel) private readonly llmModelRepo: Repository<LlmModel>,
    @InjectRepository(CompanyMarketplaceAgentKeyAssignment)
    private readonly keyAssignmentsRepo: Repository<CompanyMarketplaceAgentKeyAssignment>,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
    private readonly tasksDashboard: TasksDashboardService,
    private readonly billingDashboard: DashboardBillingService,
  ) {}

  private actorIsPlatformAdmin(actor: Actor): boolean {
    return Boolean(actor?.roles?.some((r) => r === 'admin' || r === 'superadmin'));
  }

  private usageDateUtc(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private llmRemainingPercent(key: LlmKey, usedTokensRaw: string | undefined): number {
    const quota = BigInt((key.dailyQuotaTokens ?? '0').toString() || '0');
    if (quota <= 0n) {
      return 100;
    }
    const used = BigInt((usedTokensRaw ?? '0').toString() || '0');
    if (used >= quota) {
      return 0;
    }
    const rem = quota - used;
    return Number((rem * 10000n) / quota) / 100;
  }

  async getModelPoolHealth(actor: Actor): Promise<ModelPoolHealth> {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }

    const usageDate = this.usageDateUtc(new Date());

    const [
      llmTotal,
      llmActive,
      embTotal,
      embActive,
      assignmentRows,
      assignmentWithEmbedding,
      failoverEmb,
      failoverLlm,
    ] = await Promise.all([
      this.llmKeyRepo.count(),
      this.llmKeyRepo.count({ where: { isActive: true } }),
      this.llmModelRepo.count({ where: { modelType: 'embedding' as any } }),
      this.llmModelRepo.count({ where: { modelType: 'embedding' as any, isActive: true } }),
      this.keyAssignmentsRepo.count(),
      this.keyAssignmentsRepo.count({ where: { assignedEmbeddingModelId: Not(IsNull()) } }),
      this.queryPrometheusScalar('sum(increase(embedding_pool_acquire_total{outcome="failover"}[24h]))'),
      this.queryPrometheusScalar('sum(increase(llm_key_acquire_total{outcome="failover"}[24h]))'),
    ]);

    const activeKeys = await this.llmKeyRepo.find({
      where: { isActive: true },
      select: ['id', 'modelName', 'provider', 'dailyQuotaTokens', 'isActive'],
    });
    const keyIds = activeKeys.map((k) => k.id);
    const usages =
      keyIds.length > 0
        ? await this.llmDailyUsageRepo.find({
            where: { usageDate, llmKeyId: In(keyIds) },
            select: ['llmKeyId', 'usedTokens'],
          })
        : [];
    const usedByKey = new Map(usages.map((u) => [u.llmKeyId, u.usedTokens]));

    const enriched = activeKeys.map((k) => ({
      id: k.id,
      modelName: k.modelName,
      provider: k.provider,
      remainingPercent: this.llmRemainingPercent(k, usedByKey.get(k.id)),
    }));
    enriched.sort((a, b) => a.remainingPercent - b.remainingPercent);
    const topLowKeys = enriched.slice(0, 3).map((x) => ({
      id: x.id,
      modelName: x.modelName,
      provider: x.provider,
      remainingPercent: x.remainingPercent,
    }));
    const lowestRemainingPercent = enriched.length ? Math.min(...enriched.map((x) => x.remainingPercent)) : null;

    return {
      llm: {
        total: llmTotal,
        active: llmActive,
        assignments: assignmentRows,
        todayFailover: failoverLlm != null ? Math.max(0, Math.round(failoverLlm)) : null,
        lowestRemainingPercent,
        topLowKeys,
      },
      embedding: {
        total: embTotal,
        active: embActive,
        assignments: assignmentWithEmbedding,
        todayFailover: failoverEmb != null ? Math.max(0, Math.round(failoverEmb)) : null,
        lowestRemainingPercent: null,
        topLowKeys: [],
      },
    };
  }

  async platformOverview(actor: Actor, companyIds: string[]): Promise<PlatformOverviewStats> {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      return {
        totalCompanies: 0,
        sumInProgress: 0,
        sumPending: 0,
        sumOverdue: 0,
        sumAgentsTotal: 0,
        budgetUtilization: 0,
        todayCost: 0,
        completionRate: 0,
        systemHealth: 0.5,
        sparkToken24h: [],
        sparkToken7d: [],
        sparkCreation7d: [],
        sparkAutonomy: [],
      };
    }

    // 与 CompaniesService.findAll 一致：平台 admin/superadmin 可见全量公司，不按 membership 二次收紧。
    const scopedCompanyIds = companyIds;

    // Creation trend: based on passed companyIds only (MVP approximate).
    const companies = await this.companiesRepo.find({
      where: { id: In(scopedCompanyIds) },
      select: ['id', 'createdAt'],
    });
    const createdAtById = new Map<string, Date>();
    for (const c of companies) createdAtById.set(c.id, c.createdAt);

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const created7dCounts = new Array(7).fill(0);
    for (const cid of scopedCompanyIds) {
      const createdAt = createdAtById.get(cid);
      if (!createdAt) continue;
      const daysAgo = Math.floor((now - createdAt.getTime()) / dayMs);
      if (daysAgo >= 0 && daysAgo <= 6) {
        // oldest -> newest
        const bucket = 6 - daysAgo;
        created7dCounts[bucket] += 1;
      }
    }

    const perCompany = await Promise.all(
      scopedCompanyIds.map(async (cid) => {
        const [taskSummary, billingSummary] = await Promise.all([
          this.tenantContext.runWithCompanyId(cid, () => this.tasksDashboard.getCompanySummary(actor)),
          this.tenantContext.runWithCompanyId(cid, () => this.billingDashboard.getSummary(cid)),
        ]);
        return { cid, taskSummary, billingSummary };
      }),
    );

    let sumInProgress = 0;
    let sumPending = 0;
    let sumOverdue = 0;
    let sumAgentsTotal = 0;

    let used = 0;
    let total = 0;
    let todayCost = 0;
    const completionRates: number[] = [];

    for (const { taskSummary, billingSummary } of perCompany) {
      sumInProgress += taskSummary?.activeWorkflow?.inProgress ?? 0;
      sumPending += taskSummary?.activeWorkflow?.pending ?? 0;
      sumOverdue += taskSummary?.activeWorkflow?.overdueCount ?? 0;
      sumAgentsTotal += taskSummary?.agents?.totalActive ?? 0;

      if (billingSummary?.budget) {
        const u = Number(billingSummary.budget.usedAmount ?? 0);
        const t = Number(billingSummary.budget.totalAmount ?? 0);
        used += Number.isFinite(u) ? u : 0;
        total += Number.isFinite(t) ? t : 0;
      }
      const c = Number(billingSummary?.aggregates?.todayCost ?? 0);
      todayCost += Number.isFinite(c) ? c : 0;

      completionRates.push(computeCompletionRate(taskSummary));
    }

    const budgetUtilization = total > 0 ? used / total : 0;
    const completionRate = completionRates.length
      ? completionRates.reduce((a, x) => a + x, 0) / completionRates.length
      : 0;

    // MVP approximate health: overdue is weighted more than budget utilization.
    const systemHealth = Math.max(0, 1 - sumOverdue / Math.max(1, scopedCompanyIds.length * 5) - Math.max(0, budgetUtilization - 0.9));

    // Series generation (MVP placeholder).
    const sparkToken24h = makeFakeSeries(todayCost / Math.max(1, scopedCompanyIds.length), 24);
    const sparkToken7d = makeFakeSeries(todayCost * 7, 14);
    const sparkAutonomy = makeFakeSeries(completionRate, 14);
    const sparkCreation7d = created7dCounts
      .map((v) => v + Math.random() * 0) // keep deterministic-ish structure
      .flatMap((v) => [v, Math.max(0, v - 0.2)]);
    // Ensure length 14.
    while (sparkCreation7d.length < 14) sparkCreation7d.push(0);
    const sparkCreation7dFinal = sparkCreation7d.slice(0, 14);

    return {
      totalCompanies: scopedCompanyIds.length,
      sumInProgress,
      sumPending,
      sumOverdue,
      sumAgentsTotal,
      budgetUtilization,
      todayCost,
      completionRate,
      systemHealth,
      sparkToken24h,
      sparkToken7d,
      sparkCreation7d: sparkCreation7dFinal,
      sparkAutonomy,
    };
  }

  private async queryPrometheusScalar(query: string): Promise<number | null> {
    const base = this.config.getPrometheusBaseUrl().replace(/\/+$/, '');
    const u = new URL('/api/v1/query', base);
    u.searchParams.set('query', query);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.config.getPrometheusQueryTimeoutMs());
    try {
      const res = await fetch(u.toString(), { signal: ctl.signal });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        status?: string;
        data?: { result?: Array<{ value?: [number, string] }> };
      };
      const value = json?.data?.result?.[0]?.value?.[1];
      const n = value != null ? Number(value) : Number.NaN;
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async queryPrometheusRange(query: string, start: number, end: number, stepSec: number): Promise<number[]> {
    const base = this.config.getPrometheusBaseUrl().replace(/\/+$/, '');
    const u = new URL('/api/v1/query_range', base);
    u.searchParams.set('query', query);
    u.searchParams.set('start', `${Math.floor(start / 1000)}`);
    u.searchParams.set('end', `${Math.floor(end / 1000)}`);
    u.searchParams.set('step', `${stepSec}s`);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.config.getPrometheusQueryTimeoutMs());
    try {
      const res = await fetch(u.toString(), { signal: ctl.signal });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        data?: { result?: Array<{ values?: Array<[number, string]> }> };
      };
      const values = json?.data?.result?.[0]?.values ?? [];
      return values.map(([, v]) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  private async queryPrometheusVector(
    query: string,
  ): Promise<Array<{ metric: Record<string, string>; value: number }>> {
    const base = this.config.getPrometheusBaseUrl().replace(/\/+$/, '');
    const u = new URL('/api/v1/query', base);
    u.searchParams.set('query', query);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.config.getPrometheusQueryTimeoutMs());
    try {
      const res = await fetch(u.toString(), { signal: ctl.signal });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        data?: { result?: Array<{ metric?: Record<string, string>; value?: [number, string] }> };
      };
      return (json?.data?.result ?? []).map((row) => {
        const n = Number(row?.value?.[1] ?? Number.NaN);
        return { metric: row.metric ?? {}, value: Number.isFinite(n) ? n : 0 };
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async ceoOpsMetrics(actor: Actor): Promise<CeoOpsMetrics> {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    const [
      interactiveQueueLength,
      interactiveQueueLatencyP95Ms,
      interactiveDlq24h,
      llmPrepCacheHitRatio,
      fastpathDirect,
      fastpathMerged,
      fastpathFallback,
      fastpathMiss,
      replyP95Seconds,
      costAwareSavings24h,
      latencyP95Seconds,
      memoryGraphHybridHitRate24h,
    ] = await Promise.all([
      this.queryPrometheusScalar('ceo_interactive_queue_length'),
      this.queryPrometheusScalar(
        'histogram_quantile(0.95, sum(rate(ceo_interactive_queue_latency_ms_bucket[5m])) by (le))',
      ),
      this.queryPrometheusScalar('increase(ceo_interactive_dlq_count[24h])'),
      this.queryPrometheusScalar('avg(ceo_llm_prep_cache_hit_ratio)'),
      this.queryPrometheusScalar('sum(increase(ceo_fastpath_hit_total{action="direct"}[24h]))'),
      this.queryPrometheusScalar('sum(increase(ceo_fastpath_hit_total{action="merged"}[24h]))'),
      this.queryPrometheusScalar('sum(increase(ceo_fastpath_hit_total{action="fallback"}[24h]))'),
      this.queryPrometheusScalar('sum(increase(ceo_fastpath_hit_total{action="miss"}[24h]))'),
      this.queryPrometheusScalar(
        'histogram_quantile(0.95, sum(rate(collaboration_reply_latency_seconds_bucket[5m])) by (le))',
      ),
      this.queryPrometheusScalar('sum(increase(foundry_cost_aware_savings_total[24h]))'),
      this.queryPrometheusScalar(
        'histogram_quantile(0.95, sum(rate(foundry_latency_seconds_bucket[5m])) by (le))',
      ),
      this.queryPrometheusScalar(
        'sum(increase(foundry_memory_graph_hybrid_hit_total{signal="graph_enriched"}[24h])) / (sum(increase(foundry_memory_graph_hybrid_hit_total[24h])) + 1)',
      ),
    ]);
    const fastpathTotal =
      (fastpathDirect ?? 0) + (fastpathMerged ?? 0) + (fastpathFallback ?? 0) + (fastpathMiss ?? 0);
    const fastpathHitRatio = fastpathTotal > 0 ? ((fastpathDirect ?? 0) + (fastpathMerged ?? 0)) / fastpathTotal : null;
    return {
      interactiveQueueLength,
      interactiveQueueLatencyP95Ms,
      interactiveDlq24h,
      llmPrepCacheHitRatio,
      fastpathHitRatio,
      replyP95Seconds,
      costAwareSavings24h,
      latencyP95Seconds,
      memoryGraphHybridHitRate24h,
    };
  }

  async ceoPreloadHealth(actor: Actor): Promise<CeoPreloadHealth> {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    const now = Date.now();
    const qHitRatio24h =
      'sum(increase(ceo_preload_success_total[24h])) / clamp_min(sum(increase(ceo_preload_success_total[24h])) + sum(increase(ceo_preload_fail_total[24h])) + sum(increase(ceo_preload_skip_rate[24h])), 1)';
    const qHitRatio7d =
      'sum(increase(ceo_preload_success_total[7d])) / clamp_min(sum(increase(ceo_preload_success_total[7d])) + sum(increase(ceo_preload_fail_total[7d])) + sum(increase(ceo_preload_skip_rate[7d])), 1)';
    const [preloadHitRatio24h, preloadHitRatio7d, success24h, fail24h, skipRate, p50, p95, trend24h, trend7d, topFail] =
      await Promise.all([
        this.queryPrometheusScalar(qHitRatio24h),
        this.queryPrometheusScalar(qHitRatio7d),
        this.queryPrometheusScalar('sum(increase(ceo_preload_success_total[24h]))'),
        this.queryPrometheusScalar('sum(increase(ceo_preload_fail_total[24h]))'),
        this.queryPrometheusScalar('avg(ceo_preload_skip_rate)'),
        this.queryPrometheusScalar(
          'histogram_quantile(0.5, sum(rate(ceo_preload_duration_ms_bucket[5m])) by (le))',
        ),
        this.queryPrometheusScalar(
          'histogram_quantile(0.95, sum(rate(ceo_preload_duration_ms_bucket[5m])) by (le))',
        ),
        this.queryPrometheusRange(
          'sum(increase(ceo_preload_success_total[1h])) / clamp_min(sum(increase(ceo_preload_success_total[1h])) + sum(increase(ceo_preload_fail_total[1h])),1)',
          now - 24 * 60 * 60 * 1000,
          now,
          3600,
        ),
        this.queryPrometheusRange(
          'sum(increase(ceo_preload_success_total[12h])) / clamp_min(sum(increase(ceo_preload_success_total[12h])) + sum(increase(ceo_preload_fail_total[12h])),1)',
          now - 7 * 24 * 60 * 60 * 1000,
          now,
          12 * 3600,
        ),
        this.queryPrometheusVector('topk(5, sum by (room_id) (increase(ceo_preload_fail_total[24h])))'),
      ]);

    return {
      preloadHitRatio24h,
      preloadHitRatio7d,
      trend24h,
      trend7d,
      distribution: {
        success: Math.max(0, Math.round(success24h ?? 0)),
        fail: Math.max(0, Math.round(fail24h ?? 0)),
        skip: Math.max(0, Math.round((skipRate ?? 0) * ((success24h ?? 0) + (fail24h ?? 0) + 1))),
      },
      durationMs: { p50, p95 },
      topFailRooms: topFail
        .map((x) => ({ roomId: x.metric.room_id ?? 'unknown', fails: Math.max(0, Math.round(x.value)) }))
        .slice(0, 5),
    };
  }

  /**
   * Sprint 2：公司隔离 workspace（与 apps/runner SandboxService PVC 命名一致）+ 一键恢复指引（VolumeSnapshot → PVC）。
   * 不直连 K8s：运维使用返回的 manifest 路径与 PVC 名。
   */
  async companyWorkspace(
    actor: Actor,
    companyId: string,
  ): Promise<{
    companyId: string;
    workspacePvcName: string;
    kubernetesNamespace: string;
    gvisorRuntimeClass: string;
    volumeSnapshotClassHint: string;
    restore: { manifestPath: string; description: string };
  }> {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    const safe = companyId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const pvc = `workspace-${safe}`.slice(0, 63);
    const ns = this.config.get<string>('ADMIN_RUNNER_K8S_NAMESPACE')?.trim() || 'foundry-runner';
    return {
      companyId,
      workspacePvcName: pvc,
      kubernetesNamespace: ns,
      gvisorRuntimeClass: 'gvisor',
      volumeSnapshotClassHint: 'foundry-workspace-snapclass',
      restore: {
        manifestPath: 'infrastructure/k8s/runner/volumesnapshot-restore-example.yaml',
        description:
          'Apply a PVC with spec.dataSource VolumeSnapshot; replace snapshot and PVC names. Execution isolation uses gVisor RuntimeClass on Jobs; storage uses CSI snapshots (CoW).',
      },
    };
  }
}

