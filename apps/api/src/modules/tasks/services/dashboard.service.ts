import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { TaskExecutionLog } from '../entities/task-execution-log.entity.js';
import { Task } from '../entities/task.entity.js';
import { buildNodeIdToDepartmentIdMap } from '../utils/organization-department.util.js';

interface Actor {
  id: string;
  roles?: string[];
}

/**
 * 公司级任务仪表盘：聚合任务状态、执行负载与计费相关汇总（BillingModule 可后续替换 billing_units 来源）。
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Task) private readonly tasksRepo: Repository<Task>,
    @InjectRepository(TaskExecutionLog)
    private readonly logsRepo: Repository<TaskExecutionLog>,
    @InjectRepository(Agent) private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    private readonly tenantContext: TenantContextService,
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

  private async assertMember(companyId: string, actor: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '需要登录',
      });
    }
    if (actor.roles?.includes('admin')) return;
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '无权访问该公司仪表盘',
      });
    }
  }

  async getCompanySummary(actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);

    const activeTaskStatuses = ['pending', 'in_progress', 'review'] as const;

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
        .andWhere('t.status IN (:...st)', { st: ['pending', 'in_progress', 'review'] })
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
      generatedAt: new Date().toISOString(),
    };
  }
}
