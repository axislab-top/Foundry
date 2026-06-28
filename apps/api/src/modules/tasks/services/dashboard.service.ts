import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  TenantContextService,
  SQL_SET_LOCAL_CURRENT_TENANT,
  SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER,
} from '@service/tenant';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyHeartbeatConfig } from '../../companies/entities/company-heartbeat-config.entity.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { Company } from '../../companies/entities/company.entity.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { TaskExecutionLog } from '../entities/task-execution-log.entity.js';
import { Task } from '../entities/task.entity.js';
import { buildNodeIdToDepartmentIdMap } from '../utils/organization-department.util.js';
import { SupervisorMetricsService } from '../../supervisor/services/supervisor-metrics.service.js';
import { SupervisorLessonQueryService } from '../../supervisor/services/supervisor-lesson-query.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { BudgetService } from '../../billing/services/budget.service.js';
import { MemoryGraphRolloutService } from '../../memory/services/memory-graph-rollout.service.js';
import { isPhase3RolloutCohortMember } from '../utils/phase3-rollout-cohort.util.js';

interface Actor {
  id: string;
  roles?: string[];
}

/**
 * 公司级任务仪表盘：聚合任务状态、执行负载与计费相关汇总（BillingModule 可后续替换 billing_units 来源）。
 *
 * `DASHBOARD_ACTIVE_TASK_STATUSES` 与 TasksService 委派负载口径对齐：含 `awaiting_supervision`、
 * `awaiting_approval`、`blocked` 等未终局工作态（不含 queued / completed / cancelled）。
 */
const DASHBOARD_ACTIVE_TASK_STATUSES = [
  'pending',
  'in_progress',
  'review',
  'awaiting_approval',
  'awaiting_supervision',
  'blocked',
  'paused',
] as const;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Task) private readonly tasksRepo: Repository<Task>,
    @InjectRepository(TaskExecutionLog)
    private readonly logsRepo: Repository<TaskExecutionLog>,
    @InjectRepository(Agent) private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    @InjectRepository(CompanyHeartbeatConfig)
    private readonly heartbeatRepo: Repository<CompanyHeartbeatConfig>,
    private readonly tenantContext: TenantContextService,
    private readonly supervisorMetrics: SupervisorMetricsService,
    private readonly supervisorLessons: SupervisorLessonQueryService,
    private readonly config: ConfigService,
    private readonly budgetService: BudgetService,
    private readonly memoryGraphRollout: MemoryGraphRolloutService,
  ) {}

  private getCompanyIdOrThrow(): string {
    const companyId = this.tenantContext.getCompanyId();
    if (!companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Company ID is required',
      });
    }
    return companyId;
  }

  private isAdminActor(actor: Actor): boolean {
    if (actor.roles?.includes('admin')) return true;
    const workerActorId = process.env.WORKER_ACTOR_USER_ID;
    if (workerActorId && actor.id === workerActorId) return true;
    return false;
  }

  private async assertMember(companyId: string, actor: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '需要登录',
      });
    }
    if (this.isAdminActor(actor)) return;
    const membership = await this.membershipsRepo.manager.transaction(async (manager) => {
      // RLS policies for company/membership visibility rely on app.current_tenant and (optionally)
      // app.membership_listing_user. In RPC/async contexts these values can be missing without CLS,
      // so we set them explicitly per-transaction.
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [actor.id]);

      const memberships = manager.getRepository(CompanyMembership);
      let active = await memberships.findOne({
        where: { companyId, userId: actor.id, isActive: true },
      });
      if (active) return active;

      // Robust bootstrap guard:
      // If a company was created but membership row is missing/inactive (race, partial bootstrap, legacy data),
      // allow the creator to self-heal by upserting an active owner membership.
      const company = await manager.getRepository(Company).findOne({
        where: { id: companyId } as any,
        select: ['id', 'createdBy'] as any,
      } as any);
      if (company?.createdBy && String(company.createdBy) === String(actor.id)) {
        const anyRow = await memberships.findOne({
          where: { companyId, userId: actor.id } as any,
          select: ['id', 'companyId', 'userId', 'role', 'isActive'] as any,
        } as any);
        if (anyRow) {
          if (!anyRow.isActive || anyRow.role !== 'owner') {
            await memberships.update(
              { id: anyRow.id } as any,
              { isActive: true, role: 'owner' } as any,
            );
          }
        } else {
          // Use ON CONFLICT DO NOTHING semantics to keep transaction healthy.
          await memberships
            .createQueryBuilder()
            .insert()
            .into(CompanyMembership)
            .values({
              companyId,
              userId: actor.id,
              role: 'owner',
              isActive: true,
            } as any)
            .orIgnore()
            .execute();
        }
        active = await memberships.findOne({
          where: { companyId, userId: actor.id, isActive: true } as any,
        } as any);
        if (active) return active;
      }

      return null;
    });
    if (!membership) {
      if (process.env.DEBUG_TENANT_AUTH === 'true') {
        try {
          const diag = await this.membershipsRepo.manager.transaction(async (manager) => {
            await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
            await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [actor.id]);
            const memberships = manager.getRepository(CompanyMembership);
            const anyForUser = await memberships.findOne({
              where: { userId: actor.id } as any,
              select: ['id', 'companyId', 'userId', 'role', 'isActive'] as any,
            } as any);
            const anyForCompany = await memberships.findOne({
              where: { companyId } as any,
              select: ['id', 'companyId', 'userId', 'role', 'isActive'] as any,
            } as any);
            const company = await manager.getRepository(Company).findOne({
              where: { id: companyId } as any,
              select: ['id', 'createdBy', 'status', 'isActive'] as any,
            } as any);
            return { anyForUser, anyForCompany, company };
          });
          this.logger.warn('Tenant auth denied (dashboard)', {
            companyId,
            actorId: actor.id,
            diag,
          });
        } catch (e: unknown) {
          this.logger.warn('Tenant auth denied (dashboard) diagnostic failed', {
            companyId,
            actorId: actor.id,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '无权访问该公司仪表盘',
      });
    }
  }

  async getCompanySummary(actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);

    const activeTaskStatuses = DASHBOARD_ACTIVE_TASK_STATUSES;
    const costAwareOn = this.config.isCostAwareRoutingEnabled();
    const utilizationPromise = costAwareOn
      ? this.budgetService.getUtilizationRatio(companyId).catch(() => null as number | null)
      : Promise.resolve(null as number | null);

    const [
      statusCounts,
      inProgress,
      pending,
      overdue,
      billingRow,
      activeAgents,
      agentTotal,
      nodeTotal,
      tasks,
      orgNodes,
      agents,
      retrospective,
      recentSupervisorLessons,
      recentExecLogs,
      budgetUtilization,
    ] = await Promise.all([
      this.tasksRepo
        .createQueryBuilder('t')
        .select('t.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('t.company_id = :companyId', { companyId })
        .groupBy('t.status')
        .getRawMany<{ status: string; count: string }>(),
      this.tasksRepo.count({ where: { companyId, status: 'in_progress' } }),
      this.tasksRepo.count({ where: { companyId, status: 'pending' } }),
      this.tasksRepo
        .createQueryBuilder('t')
        .where('t.company_id = :companyId', { companyId })
        .andWhere('t.due_date IS NOT NULL')
        .andWhere('t.due_date < NOW()')
        .andWhere('t.status NOT IN (:...done)', { done: ['completed', 'cancelled'] })
        .getCount(),
      this.logsRepo
        .createQueryBuilder('l')
        .select('COALESCE(SUM(l.billing_units), 0)', 'total')
        .where('l.company_id = :companyId', { companyId })
        .getRawOne<{ total: string }>(),
      this.tasksRepo
        .createQueryBuilder('t')
        .select('COUNT(DISTINCT t.assignee_id)', 'c')
        .where('t.company_id = :companyId', { companyId })
        .andWhere('t.assignee_type = :atype', { atype: 'agent' })
        .andWhere('t.status IN (:...st)', { st: [...DASHBOARD_ACTIVE_TASK_STATUSES] })
        .getRawOne<{ c: string }>(),
      this.agentsRepo.count({ where: { companyId, status: 'active' } }),
      this.nodesRepo.count({ where: { companyId } }),
      this.tasksRepo.find({
        where: { companyId, status: In([...activeTaskStatuses]) },
        select: ['id', 'assigneeType', 'assigneeId'],
      }),
      this.nodesRepo.find({
        where: { companyId },
        select: ['id', 'parentId', 'type', 'name'],
      }),
      this.agentsRepo.find({
        where: { companyId },
        select: ['id', 'organizationNodeId'],
      }),
      this.supervisorMetrics.getRetrospectiveSlice(companyId),
      this.supervisorLessons.listRecent(companyId, 8),
      this.logsRepo.find({
        where: { companyId },
        order: { createdAt: 'DESC' },
        take: 40,
        select: ['id', 'outputSnapshot', 'createdAt'],
      }),
      utilizationPromise,
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      byStatus[row.status] = parseInt(row.count, 10);
    }

    const nodeMap = new Map(orgNodes.map((n) => [n.id, n]));
    const nodeToDept = buildNodeIdToDepartmentIdMap(orgNodes);
    const agentOrgSlot = new Map(agents.map((a) => [a.id, a.organizationNodeId]));

    const departmentIds = orgNodes.filter((n) => n.type === 'department').map((n) => n.id);
    const deptTaskCounts = new Map<string, number>();
    for (const id of departmentIds) {
      deptTaskCounts.set(id, 0);
    }

    for (const t of tasks) {
      let anchor: string | null = null;
      if (t.assigneeType === 'organization_node' && t.assigneeId) {
        anchor = t.assigneeId;
      } else if (t.assigneeType === 'agent' && t.assigneeId) {
        anchor = agentOrgSlot.get(t.assigneeId) ?? null;
      }
      const deptId = anchor ? (nodeToDept.get(anchor) ?? null) : null;
      if (deptId && deptTaskCounts.has(deptId)) {
        deptTaskCounts.set(deptId, (deptTaskCounts.get(deptId) ?? 0) + 1);
      }
    }

    const departmentLoad = departmentIds
      .map((organizationNodeId) => ({
        organizationNodeId,
        name: nodeMap.get(organizationNodeId)?.name?.trim() || '部门',
        activeTasks: deptTaskCounts.get(organizationNodeId) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

    const predictivePathHistogram: Record<string, number> = {};
    for (const row of recentExecLogs) {
      const snap = row.outputSnapshot;
      if (!snap || typeof snap !== 'object') continue;
      const rec = snap as Record<string, unknown>;
      const p =
        typeof rec['predictivePath'] === 'string'
          ? rec['predictivePath']
          : typeof rec['predictive_path'] === 'string'
            ? rec['predictive_path']
            : typeof rec['foundry_predictive_path'] === 'string'
              ? rec['foundry_predictive_path']
              : null;
      if (typeof p === 'string' && p.trim()) {
        const k = p.trim();
        predictivePathHistogram[k] = (predictivePathHistogram[k] ?? 0) + 1;
      }
    }

    let memoryGraphV2Effective = false;
    try {
      memoryGraphV2Effective = await this.memoryGraphRollout.isMemoryGraphV2Effective(companyId);
    } catch {
      memoryGraphV2Effective = false;
    }

    let cortexConsistency: {
      checked: boolean;
      liveActiveAgents: number;
      snapshotAgentCount: number | null;
      aligned: boolean | null;
    } = {
      checked: memoryGraphV2Effective,
      liveActiveAgents: agentTotal,
      snapshotAgentCount: null,
      aligned: null,
    };
    if (memoryGraphV2Effective) {
      try {
        const ceoNs = `company:${companyId}:ceo:layer:L1`;
        const rows = await this.dataSource.query(
          `
          SELECT (me.metadata->>'agentCount')::int AS "agentCount"
          FROM memory_entries me
          INNER JOIN memory_collections mc ON mc.id = me.collection_id
          WHERE mc.company_id = $1::uuid AND mc.namespace = $2
            AND (me.metadata->>'kind') = 'company_cortex_facts_sync'
          ORDER BY me.created_at DESC
          LIMIT 1
          `,
          [companyId, ceoNs],
        );
        const snap =
          Array.isArray(rows) && rows[0] && Number.isFinite(Number((rows[0] as { agentCount?: number }).agentCount))
            ? Number((rows[0] as { agentCount: number }).agentCount)
            : null;
        cortexConsistency = {
          checked: true,
          liveActiveAgents: agentTotal,
          snapshotAgentCount: snap,
          aligned: snap == null ? null : snap === agentTotal,
        };
      } catch {
        cortexConsistency = {
          checked: true,
          liveActiveAgents: agentTotal,
          snapshotAgentCount: null,
          aligned: null,
        };
      }
    }

    let phase3HeartbeatPercentOverride: number | null = null;
    try {
      const hb = await this.heartbeatRepo.findOne({
        where: { companyId },
        select: ['metadata'],
      });
      const meta = hb?.metadata ?? {};
      const raw = meta['phase3RolloutPercent'] ?? meta['phase3_rollout_percent'];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        phase3HeartbeatPercentOverride = Math.max(0, Math.min(100, Math.floor(raw)));
      } else if (typeof raw === 'string') {
        const n = parseInt(raw.trim(), 10);
        if (Number.isFinite(n)) phase3HeartbeatPercentOverride = Math.max(0, Math.min(100, n));
      }
    } catch {
      phase3HeartbeatPercentOverride = null;
    }

    const phase3RolloutCohort = isPhase3RolloutCohortMember(companyId, {
      masterEnabled: this.config.isPhase3RolloutEnabled(),
      percent: this.config.getPhase3RolloutPercent(),
      whitelistCompanyIds: this.config.getPhase3RolloutWhitelistCompanyIds(),
      heartbeatPercentOverride: phase3HeartbeatPercentOverride,
    });

    const predictivePathsSampled = Object.values(predictivePathHistogram).reduce((a, b) => a + b, 0);

    return {
      companyId,
      taskCountsByStatus: byStatus,
      activeWorkflow: {
        inProgress,
        pending,
        overdueCount: overdue,
      },
      agents: {
        activeInTasks: parseInt(activeAgents?.c ?? '0', 10),
        totalActive: agentTotal,
      },
      organization: {
        nodes: nodeTotal,
      },
      departmentLoad,
      billing: {
        totalUnitsFromExecutionLogs: billingRow?.total ?? '0',
      },
      retrospective,
      recentSupervisorLessons,
      predictivePathRecent: predictivePathHistogram,
      phase1: {
        rolloutPercent: this.config.getPhase1RolloutPercent(),
        rolloutWhitelistConfigured: this.config.getPhase1RolloutWhitelistCompanyIds().length > 0,
      },
      phase2: {
        rolloutPercent: this.config.getPhase2RolloutPercent(),
        rolloutWhitelistConfigured: this.config.getPhase2RolloutWhitelistCompanyIds().length > 0,
        autonomousEventBusV2Enabled: this.config.isAutonomousEventBusV2Enabled(),
        chatIngressUsesDomainV2: this.config.isAutonomousEventBusV2Enabled(),
        multiAgentGraphV2Enabled: this.config.isMultiAgentGraphV2Enabled(),
        directorAutonomousEnabled: this.config.isDirectorAutonomousEnabled(),
        employeeAutonomousEnabled: this.config.isEmployeeAutonomousEnabled(),
        crossDepartmentCoordinationEnabled: this.config.isCrossDepartmentCoordinationEnabled(),
      },
      autonomousMetrics: {
        /** 与 execution log 中 predictive 元数据弱关联的占位观测 */
        executionLogPredictiveKeys: Object.keys(predictivePathHistogram).length,
      },
      costAwareMetrics: costAwareOn
        ? {
            enabled: true,
            budgetUtilization: budgetUtilization ?? null,
            budgetHealth:
              typeof budgetUtilization === 'number' && Number.isFinite(budgetUtilization)
                ? Math.max(0, Math.min(1, 1 - budgetUtilization))
                : null,
            /** 粗粒度启发式：高利用率时假定更多 token 被「省」在便宜路径（真实值见 OTEL `foundry.cost.aware.savings`） */
            tokenSavingsRateApprox:
              typeof budgetUtilization === 'number' && Number.isFinite(budgetUtilization)
                ? Number((0.12 + 0.35 * Math.max(0, budgetUtilization - this.config.getCostAwareBudgetThreshold())).toFixed(4))
                : null,
            downgradeCount24hEstimate: null,
          }
        : {
            enabled: false,
            budgetUtilization: null,
            budgetHealth: null,
            tokenSavingsRateApprox: null,
            downgradeCount24hEstimate: null,
          },
      phase3: {
        rollout: {
          masterEnabled: this.config.isPhase3RolloutEnabled(),
          cohortMember: phase3RolloutCohort,
          percent: this.config.getPhase3RolloutPercent(),
          heartbeatPercentOverride: phase3HeartbeatPercentOverride,
          whitelistConfigured: this.config.getPhase3RolloutWhitelistCompanyIds().length > 0,
          /** 客户端 / 运维：`?ff=phase3_bundle` 与 metadata `featureFlags` 对齐（ cohort 在请求上下文内计算，仪表盘为进程级近似）。 */
          ffAliases: ['phase3_bundle', 'phase3-bundle'],
        },
        memoryGraph: {
          processEnabled: this.config.isMemoryGraphV2Enabled(),
          effectiveForCompany: memoryGraphV2Effective,
        },
        cortexConsistency,
        slo: {
          targets: {
            p95LatencySeconds: 3,
            directorAutonomyRate: 0.8,
            memoryGraphHitRate: 0.6,
            costSavingsRate: 0.15,
          },
          /** 仪表盘启发式信号；生产 SLO 以 Prometheus / OTEL 为准（见 `deployment/alerting/phase3-slo.rules.yml`）。 */
          signals: {
            predictivePathsSampled,
            costSavingsRateApprox: costAwareOn
              ? typeof budgetUtilization === 'number' && Number.isFinite(budgetUtilization)
                ? Number(
                    (
                      0.12 +
                      0.35 * Math.max(0, budgetUtilization - this.config.getCostAwareBudgetThreshold())
                    ).toFixed(4),
                  )
                : null
              : null,
            memoryGraphRolloutActive: memoryGraphV2Effective,
          },
        },
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
