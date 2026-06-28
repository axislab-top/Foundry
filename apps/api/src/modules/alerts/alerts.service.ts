import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CacheService } from '../../common/cache/cache.service.js';
import { TenantRlsService, SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER } from '@service/tenant';
import type {
  BudgetCriticalLowEvent,
  BudgetExceededEvent,
  BudgetWarningEvent,
  SkillExecutedEvent,
  TaskBlockedEvent,
  TaskProgressUpdatedEvent,
} from '@contracts/events';
import type { AdminAlertSeverity, AdminAlertStatus } from './entities/admin-alert.entity.js';
import { AdminAlert } from './entities/admin-alert.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import type { AlertsActorDto } from './dto/resolve-alert.dto.js';
import { CollaborationRealtimePublisher } from '../collaboration/services/collaboration-realtime-publisher.service.js';
import { ConfigService } from '../../common/config/config.service.js';

const BILLING_WARNING_DEDUP_TTL_SEC = 3600; // 1h
const BILLING_EXCEEDED_DEDUP_TTL_SEC = 7 * 24 * 3600; // 7d

type AlertCreateInput = {
  companyId: string;
  agentId?: string | null;
  severity: AdminAlertSeverity;
  type: string;
  message: string;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(AdminAlert) private readonly alertsRepo: Repository<AdminAlert>,
    @InjectRepository(CompanyMembership) private readonly membershipsRepo: Repository<CompanyMembership>,
    private readonly cache: CacheService,
    private readonly tenantRls: TenantRlsService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly realtime: CollaborationRealtimePublisher,
    private readonly config: ConfigService,
  ) {}

  private actorIsAdmin(actor: { roles?: string[] }): boolean {
    return Boolean(actor?.roles?.some((r) => r === 'admin' || r === 'superadmin'));
  }

  private actorIsSuperAdmin(actor: { roles?: string[] }): boolean {
    return Boolean(actor?.roles?.includes('superadmin'));
  }

  private async assertCanAccessCompanyAlerts(
    actor: { id: string; roles?: string[] },
    companyId?: string,
  ): Promise<void> {
    if (this.actorIsAdmin(actor)) return;
    if (!companyId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Insufficient permissions',
      });
    }
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true } as any,
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Insufficient permissions',
      });
    }
  }

  async listAlerts(params: any): Promise<{ items: AdminAlert[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const { actor, page = 1, pageSize = 20, severity, status, type, companyId, agentId, search } = params;
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Insufficient permissions',
      });
    }
    await this.assertCanAccessCompanyAlerts(actor, companyId);
    if (!this.actorIsAdmin(actor) && !companyId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'companyId is required',
      });
    }

    const pageSafe = Number.isFinite(page) ? Number(page) : 1;
    const pageSizeSafe = Math.min(100, Math.max(1, Number(pageSize) || 20));

    // Tenant isolation relies on RLS policies + membership listing user.
    // For non-superadmin: we set membership_listing_user to actor.id and let policy filter.
    // For superadmin: we still set it; superadmin must be a member in order to read.
    return await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [actor.id]);

      const qb = manager
        .createQueryBuilder(AdminAlert, 'a')
        .leftJoin(
          CompanyMembership,
          'm',
          'm.company_id = a.company_id AND m.user_id = :uid AND m.is_active = true',
          { uid: actor.id },
        );

      if (!this.actorIsSuperAdmin(actor)) {
        // Keep filtering in SQL even with RLS disabled/misconfigured.
        qb.andWhere(
          '(a.company_id IS NULL OR a.company_id IN (SELECT company_id FROM company_memberships WHERE user_id = :uid AND is_active = true))',
          { uid: actor.id },
        );
      }

      if (companyId) qb.andWhere('a.company_id = :cid', { cid: companyId });
      if (agentId) qb.andWhere('a.agentId = :aid', { aid: agentId });
      if (severity) qb.andWhere('a.severity = :sev', { sev: severity });
      if (status) qb.andWhere('a.status = :st', { st: status });
      if (type) qb.andWhere('a.type = :t', { t: type });
      if (search) qb.andWhere('(a.message ILIKE :s OR a.type ILIKE :s)', {
        s: `%${search}%`,
      });

      qb.orderBy('a.createdAt', 'DESC').skip((pageSafe - 1) * pageSizeSafe).take(pageSizeSafe);
      const [items, total] = await qb.getManyAndCount();
      return {
        items,
        total,
        page: pageSafe,
        pageSize: pageSizeSafe,
        totalPages: Math.ceil(total / pageSizeSafe) || 0,
      };
    });
  }

  async resolveAlert(params: { actor: AlertsActorDto; id: string; remark?: string }): Promise<{ id: string }> {
    const { actor, id, remark } = params;
    if (!actor?.id) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'Insufficient permissions' });
    }

    const alert = await this.alertsRepo.findOne({ where: { id } });
    if (!alert) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Alert not found' });
    }

    const companyId = alert.companyId;
    if (!companyId) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'No company scope for this alert' });
    }

    if (!this.actorIsSuperAdmin(actor)) {
      await this.assertCanAccessCompanyAlerts(actor, companyId);
    }

    // For RLS: set current tenant to alert.companyId before update.
    await this.tenantRls.withTenantTransaction(this.dataSource as any, companyId, async (manager) => {
      alert.status = 'resolved';
      alert.handledAt = new Date();
      alert.handledBy = actor.id;
      alert.remark = remark ?? null;
      await manager.getRepository(AdminAlert).save(alert);
    });

    await this.realtime.publishEnvelope({
      event: 'alerts:resolved',
      companyId,
      payload: { alert },
    });

    return { id };
  }

  async createAlert(input: AlertCreateInput): Promise<AdminAlert> {
    // Writes should satisfy RLS WITH CHECK. We set local current tenant to companyId.
    return await this.tenantRls.withTenantTransaction(this.dataSource as any, input.companyId, async (manager) => {
      const row = this.alertsRepo.create({
        companyId: input.companyId,
        agentId: input.agentId ?? null,
        severity: input.severity,
        type: input.type,
        message: input.message,
        metadata: input.metadata ?? null,
        status: 'open',
        handledAt: null,
        handledBy: null,
        remark: null,
      });
      const saved = await manager.getRepository(AdminAlert).save(row);

      await this.realtime.publishEnvelope({
        event: 'alerts:new',
        companyId: input.companyId,
        payload: { alert: saved },
      });

      return saved;
    });
  }

  async createFromBudgetEvent(
    event: BudgetWarningEvent | BudgetExceededEvent | BudgetCriticalLowEvent,
  ): Promise<void> {
    const companyId = (event as any).data?.companyId as string | undefined;
    if (!companyId) return;

    const type = event.eventType;
    const utilization = (event as any).data?.utilization as number | undefined;
    const warningThreshold = (event as any).data?.warningThreshold as number | undefined;
    const criticalThreshold = (event as any).data?.criticalThreshold as number | undefined;

    if (type === 'budget.critical_low') {
      await this.maybePhase3BudgetCriticalWithAutonomousAlert(companyId, utilization);
    }

    const dedupKey = `alerts:budget:${companyId}:${type}`;
    const dedupTtl =
      type === 'budget.exceeded'
        ? BILLING_EXCEEDED_DEDUP_TTL_SEC
        : type === 'budget.critical_low'
          ? BILLING_WARNING_DEDUP_TTL_SEC
          : BILLING_WARNING_DEDUP_TTL_SEC;
    if (await this.cache.exists(dedupKey)) return;

    const severity: AdminAlertSeverity =
      type === 'budget.exceeded' ? 'high' : type === 'budget.critical_low' ? 'high' : 'medium';
    const message =
      type === 'budget.exceeded'
        ? `预算已超支（utilization=${utilization?.toFixed?.(2) ?? utilization}）`
        : type === 'budget.critical_low'
          ? `预算临界：剩余约 ${((1 - (utilization ?? 0)) * 100).toFixed(0)}%（utilization=${utilization?.toFixed?.(2) ?? utilization}）`
          : `预算预警（utilization=${utilization?.toFixed?.(2) ?? utilization} / warning=${warningThreshold ?? 'n/a'}）`;

    await this.createAlert({
      companyId,
      severity,
      type: type,
      message,
      metadata: {
        utilization,
        warningThreshold,
        criticalThreshold,
        occurredAt: event.occurredAt,
        eventId: event.eventId,
      },
    });

    await this.cache.set(dedupKey, '1', dedupTtl);
  }

  /**
   * W16：预算临界且 Phase3 总闸 + Director 自主同时开启时落库（去重），提示「高自主 + 低预算」组合风险。
   */
  private async maybePhase3BudgetCriticalWithAutonomousAlert(
    companyId: string,
    utilization: number | undefined,
  ): Promise<void> {
    if (!this.config.isPhase3RolloutEnabled()) return;
    if (!this.config.isDirectorAutonomousEnabled()) return;
    const dedupKey = `alerts:phase3:budget_autonomous:${companyId}`;
    if (await this.cache.exists(dedupKey)) return;
    await this.createAlert({
      companyId,
      severity: 'high',
      type: 'phase3.budget_critical.autonomous_active',
      message: `Phase3：预算临界且 Director 自主已开启（utilization=${utilization?.toFixed?.(4) ?? utilization}）；请复核自动委派与模型成本。`,
      metadata: { utilization, source: 'budget.critical_low' },
    });
    await this.cache.set(dedupKey, '1', 6 * 3600);
  }

  /** W16：延迟 P95 超阈（由观测流水线 / Alertmanager Webhook 调用）。 */
  async createPhase3LatencySloAlert(companyId: string, p95Seconds: number): Promise<void> {
    if (p95Seconds < 3) return;
    const dedupKey = `alerts:phase3:latency:${companyId}:${Math.floor(Date.now() / 3_600_000)}`;
    if (await this.cache.exists(dedupKey)) return;
    await this.createAlert({
      companyId,
      severity: 'high',
      type: 'phase3.slo.latency_p95',
      message: `Phase3 SLO：P95 延迟 ${p95Seconds.toFixed(2)}s 超过 3s 目标`,
      metadata: { p95Seconds, targetSeconds: 3 },
    });
    await this.cache.set(dedupKey, '1', 3600);
  }

  /** W16：Memory Graph 退化（命中率 / hybrid 信号异常；由观测或 Memory 服务调用）。 */
  async createPhase3MemoryGraphDegradationAlert(
    companyId: string,
    payload: { hitRate?: number; reason?: string },
  ): Promise<void> {
    const dedupKey = `alerts:phase3:memory_graph:${companyId}:${Math.floor(Date.now() / 3_600_000)}`;
    if (await this.cache.exists(dedupKey)) return;
    await this.createAlert({
      companyId,
      severity: 'medium',
      type: 'phase3.slo.memory_graph_degraded',
      message: `Phase3 SLO：Memory Graph 信号异常（hitRate=${payload.hitRate ?? 'n/a'}；${payload.reason ?? 'no detail'}）`,
      metadata: payload,
    });
    await this.cache.set(dedupKey, '1', 3600);
  }

  async createFromSkillEvent(event: SkillExecutedEvent): Promise<void> {
    const companyId = event.data.companyId;
    if (!companyId) return;
    const agentId = event.data.agentId;

    const s = safeJsonString(event.data.argsSummary) + '\n' + safeJsonString(event.data.resultSummary);

    const sensitiveHints = ['payment', 'credit', 'card', 'charge', 'refund', 'transfer', 'delete', 'drop table'];
    const hasSensitive = sensitiveHints.some((h) => s.toLowerCase().includes(h));

    const promptInjectionPatterns = ['ignore previous', 'system prompt', 'developer message', 'jailbreak', '露出'];
    const hasInjection = promptInjectionPatterns.some((p) => s.toLowerCase().includes(p.toLowerCase()));

    if (!hasSensitive && !hasInjection) return;

    const severity: AdminAlertSeverity = hasSensitive || hasInjection ? 'high' : 'medium';
    const type = hasInjection ? 'skill.prompt_injection' : 'skill.sensitive_risk';
    const message =
      type === 'skill.prompt_injection'
        ? `检测到潜在提示注入风险（skill=${event.data.skillName ?? 'unknown'}）`
        : `检测到敏感风险调用（skill=${event.data.skillName ?? 'unknown'}）`;

    await this.createAlert({
      companyId,
      agentId: agentId ?? null,
      severity,
      type,
      message,
      metadata: {
        skillId: event.data.skillId,
        skillName: event.data.skillName,
        traceId: event.data.traceId ?? null,
        eventId: event.eventId,
      },
    });
  }

  async createFromTaskBlockedEvent(event: TaskBlockedEvent): Promise<void> {
    const companyId = event.data.companyId;
    if (!companyId) return;

    const reason = event.data.reason ?? '';
    const severity: AdminAlertSeverity = reason.toLowerCase().includes('deadlock') ? 'high' : 'medium';
    const type = 'task.blocked';
    const message = `任务阻塞：${reason || '(no reason)'}`;

    await this.createAlert({
      companyId,
      severity,
      type,
      message,
      metadata: {
        taskId: event.data.taskId,
        blockedAt: event.data.blockedAt,
        reason,
        eventId: event.eventId,
      },
    });
  }

  async createFromTaskProgressEvent(event: TaskProgressUpdatedEvent): Promise<void> {
    const companyId = event.data.companyId;
    if (!companyId) return;

    // MVP: if progress stays very low while task is in_progress, raise a low/medium alert.
    const { taskId, progress, status, updatedAt } = event.data;
    if (status !== 'in_progress') return;
    if (progress > 0.15) return;

    const dedupKey = `alerts:task-progress:${companyId}:${taskId}:${Math.floor(Date.parse(updatedAt) / 60000)}`;
    if (await this.cache.exists(dedupKey)) return;
    await this.cache.set(dedupKey, '1', 15 * 60);

    await this.createAlert({
      companyId,
      severity: 'medium',
      type: 'task.progress.low',
      message: `任务进度停滞（${Math.round(progress * 100)}%）`,
      metadata: {
        taskId,
        progress,
        status,
        updatedAt,
        eventId: event.eventId,
      },
    });
  }
}

function safeJsonString(v: unknown): string {
  try {
    if (v == null) return '';
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

