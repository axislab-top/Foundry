import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import type {
  CompanyCompletionStatus,
  CompanyReviewResult,
  CompanyStateSnapshot,
  CompanyStuckTaskSignal,
  CompanyStrategicContext,
} from '../dto/company-heartbeat-context.dto.js';

@Injectable()
export class CompanyReviewService {
  private readonly logger = new Logger(CompanyReviewService.name);

  constructor(
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }

  private asDate(v: unknown): Date | null {
    if (typeof v !== 'string' || !v.trim()) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private calcAgeHours(d: Date): number {
    return Math.max(0, (Date.now() - d.getTime()) / 3_600_000);
  }

  private detectPossibleCause(task: {
    blockedReason?: string | null;
    metadata?: Record<string, unknown> | null;
  }): CompanyStuckTaskSignal['possibleCause'] {
    const metaCause = String((task.metadata as any)?.possibleCause ?? '').trim().toLowerCase();
    if (metaCause === 'self_mention_loop') {
      return 'self_mention_loop';
    }
    if (String(task.blockedReason ?? '').trim() || task.metadata) return 'timeout';
    return 'unknown';
  }

  private async listTasksByStatus(
    companyId: string,
    status: 'in_progress' | 'blocked',
    pageSize = 50,
    maxPages = 5,
  ): Promise<
    Array<{
      id: string;
      title?: string;
      status: 'in_progress' | 'blocked';
      assigneeId?: string | null;
      blockedReason?: string | null;
      metadata?: Record<string, unknown> | null;
      updatedAt?: string;
      createdAt?: string;
    }>
  > {
    const actor = this.actor();
    const out: Array<{
      id: string;
      title?: string;
      status: 'in_progress' | 'blocked';
      assigneeId?: string | null;
      blockedReason?: string | null;
      metadata?: Record<string, unknown> | null;
      updatedAt?: string;
      createdAt?: string;
    }> = [];
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages && page <= maxPages) {
      const res = await this.rpc<{
        items?: Array<{
          id: string;
          title?: string;
          status?: string;
          assigneeId?: string | null;
          blockedReason?: string | null;
          metadata?: Record<string, unknown> | null;
          updatedAt?: string;
          createdAt?: string;
        }>;
        totalPages?: number;
      }>('tasks.findAll', {
        companyId,
        actor,
        status,
        page,
        pageSize,
      }).catch(() => ({ items: [], totalPages: 1 }));
      const items = Array.isArray(res.items) ? res.items : [];
      for (const it of items) {
        if (!it?.id) continue;
        out.push({
          id: it.id,
          title: it.title,
          status,
          assigneeId: it.assigneeId ?? null,
          blockedReason: it.blockedReason ?? null,
          metadata: it.metadata ?? null,
          updatedAt: it.updatedAt,
          createdAt: it.createdAt,
        });
      }
      totalPages =
        typeof res.totalPages === 'number' && Number.isFinite(res.totalPages) && res.totalPages > 0
          ? Math.floor(res.totalPages)
          : 1;
      page += 1;
    }
    return out;
  }

  private calculateCompletionStatus(snapshot: CompanyStateSnapshot, stuckCount: number): CompanyCompletionStatus {
    const openTasks = snapshot.tasks.pending + snapshot.tasks.inProgress + snapshot.tasks.review + snapshot.tasks.blocked;
    const completedTasks = snapshot.tasks.completed;
    const total = openTasks + completedTasks;
    const pct = (n: number) => (total <= 0 ? 0 : Math.max(0, Math.min(100, (n / total) * 100)));
    return {
      openTasks,
      completedTasks,
      completionRate: Number(pct(completedTasks).toFixed(2)),
      blockedRate: Number(pct(snapshot.tasks.blocked).toFixed(2)),
      stuckRate: Number(pct(stuckCount).toFixed(2)),
    };
  }

  private async detectStuckTasks(companyId: string): Promise<CompanyStuckTaskSignal[]> {
    if (!this.config.isCompanyStuckTaskDetectionEnabled()) return [];
    const maxHoursInProgress = this.config.getCompanyStuckMaxHoursInProgress();
    const maxHoursBlocked = this.config.getCompanyStuckMaxHoursBlocked();
    const [inProgress, blocked] = await Promise.all([
      this.listTasksByStatus(companyId, 'in_progress'),
      this.listTasksByStatus(companyId, 'blocked'),
    ]);
    const all = [...inProgress, ...blocked];
    const signals: CompanyStuckTaskSignal[] = [];
    for (const t of all) {
      const ts = this.asDate(t.updatedAt) ?? this.asDate(t.createdAt);
      if (!ts) continue;
      const ageHours = this.calcAgeHours(ts);
      const limit = t.status === 'blocked' ? maxHoursBlocked : maxHoursInProgress;
      if (ageHours < limit) continue;
      signals.push({
        id: t.id,
        title: t.title ?? `task:${t.id}`,
        status: t.status,
        assigneeId: t.assigneeId ?? null,
        ageHours: Number(ageHours.toFixed(2)),
        updatedAt: t.updatedAt,
        possibleCause: this.detectPossibleCause(t),
      });
    }
    return signals.sort((a, b) => b.ageHours - a.ageHours).slice(0, 30);
  }

  async reviewCompany(
    snapshot: CompanyStateSnapshot,
    strategicContext: CompanyStrategicContext,
  ): Promise<CompanyReviewResult> {
    const stuckTasks = await this.detectStuckTasks(snapshot.companyId).catch((e: unknown) => {
      this.logger.warn('company review stuck-task detection failed', {
        companyId: snapshot.companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return [] as CompanyStuckTaskSignal[];
    });
    const baseScore = 90;
    const budgetPenalty =
      snapshot.budget.warningThreshold > 0 && snapshot.budget.remaining < snapshot.budget.warningThreshold
        ? 25
        : 0;
    const blockedPenalty = snapshot.tasks.blocked * 8;
    const approvalPenalty = snapshot.approvals.pending * 3;
    const executionPenalty = snapshot.tasks.inProgress === 0 && snapshot.tasks.pending > 0 ? 8 : 0;
    const stuckPenalty = Math.min(30, stuckTasks.length * 4);
    const riskPenalty = budgetPenalty + blockedPenalty + approvalPenalty + executionPenalty + stuckPenalty;
    const healthScore = Math.max(0, Math.min(100, baseScore - riskPenalty));
    const keyRisks = [
      ...(budgetPenalty > 0 ? ['budget nearing warning threshold'] : []),
      ...(snapshot.tasks.blocked > 0 ? [`blocked tasks=${snapshot.tasks.blocked}`] : []),
      ...(snapshot.approvals.pending > 5 ? ['approval backlog can delay execution'] : []),
      ...(executionPenalty > 0 ? ['execution throughput is low'] : []),
      ...(stuckTasks.length > 0 ? [`stuck tasks=${stuckTasks.length}`] : []),
    ];
    const focusAreas = strategicContext.strategicNotes.slice(0, 3);
    const selfMentionLoopCount = stuckTasks.filter((t) => t.possibleCause === 'self_mention_loop').length;
    const completionStatus = this.calculateCompletionStatus(snapshot, stuckTasks.length);
    const recommendations = [
      ...(snapshot.approvals.pending > 0 ? ['prioritize pending approvals clearance'] : []),
      ...(snapshot.tasks.blocked > 0 ? ['unblock blocked tasks before new work dispatch'] : []),
      ...(stuckTasks.length > 0 ? ['recover stuck tasks before expanding new dispatch'] : []),
      ...(selfMentionLoopCount > 0
        ? [`repair potential self-mention loops (${selfMentionLoopCount}) and reroute handoff targets`]
        : []),
      ...(budgetPenalty > 0 ? ['reduce spend intensity and request budget top-up'] : []),
      ...(keyRisks.length === 0 ? ['continue current execution cadence'] : []),
    ];
    return {
      healthScore,
      keyRisks,
      focusAreas,
      recommendations,
      stuckTasks,
      completionStatus,
    };
  }
}
