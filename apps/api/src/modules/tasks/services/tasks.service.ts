import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { dependencyGraphHasCycle } from '@foundry/task-core';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import type {
  TaskBlockedEvent,
  TaskCompletedEvent,
  TaskCreatedEvent,
  TaskProgressUpdatedEvent,
  TaskSummaryGeneratedEvent,
  TaskUpdatedEvent,
} from '@contracts/events';
import { CacheService } from '../../../common/cache/cache.service.js';
import {
  getOrgTreeVersionCacheKey,
  getTaskDeptSubtreeCacheKey,
} from '../../../common/organization/org-tree-cache-keys.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { AssignTaskDto } from '../dto/assign-task.dto.js';
import { CreateTaskDto } from '../dto/create-task.dto.js';
import { QueryTasksDto } from '../dto/query-tasks.dto.js';
import { UpdateProgressDto } from '../dto/update-progress.dto.js';
import { UpdateTaskDto } from '../dto/update-task.dto.js';
import { CollaborationApprovalNotifier } from '../../collaboration/services/collaboration-approval-notifier.service.js';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { TaskAssignment } from '../entities/task-assignment.entity.js';
import { TaskDependency } from '../entities/task-dependency.entity.js';
import { Task, type TaskStatus } from '../entities/task.entity.js';
import { collectDescendantOrgNodeIds } from '../utils/organization-department.util.js';

interface Actor {
  id: string;
  roles?: string[];
}

/** 合法状态迁移（不含保持不变） */
const ALLOWED_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'review', 'awaiting_approval', 'blocked', 'cancelled', 'paused'],
  in_progress: [
    'review',
    'awaiting_approval',
    'completed',
    'blocked',
    'cancelled',
    'pending',
    'paused',
  ],
  review: [
    'completed',
    'in_progress',
    'awaiting_approval',
    'blocked',
    'cancelled',
    'paused',
  ],
  awaiting_approval: ['in_progress', 'completed', 'blocked', 'cancelled', 'review', 'paused'],
  completed: [],
  blocked: ['in_progress', 'cancelled', 'pending', 'awaiting_approval'],
  cancelled: [],
  paused: ['in_progress', 'pending', 'cancelled', 'blocked'],
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  /** 部门子树 id 列表缓存 TTL；组织树版本号变更会使缓存键失效 */
  private readonly deptSubtreeCacheTtlSec = 300;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Task) private readonly tasksRepo: Repository<Task>,
    @InjectRepository(TaskDependency)
    private readonly taskDepsRepo: Repository<TaskDependency>,
    @InjectRepository(TaskAssignment)
    private readonly assignmentsRepo: Repository<TaskAssignment>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    private readonly cacheService: CacheService,
    private readonly tenantContext: TenantContextService,
    private readonly messagingService: MessagingService,
    private readonly collabRealtime: CollaborationRealtimePublisher,
    private readonly collabApproval: CollaborationApprovalNotifier,
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
        message: '无权访问该公司任务',
      });
    }
  }

  private async assertAdmin(companyId: string, actor: Actor): Promise<void> {
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
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅 Owner/Admin 可执行此操作',
      });
    }
  }

  private async assertCanUpdateProgress(
    companyId: string,
    task: Task,
    actor: Actor,
  ): Promise<void> {
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
    if (membership && ['owner', 'admin'].includes(membership.role)) return;
    if (task.createdByUserId && task.createdByUserId === actor.id) return;
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: '仅 Owner/Admin 或任务创建人可更新进度',
    });
  }

  private assertValidStatusTransition(from: TaskStatus, to: TaskStatus): void {
    if (from === to) return;
    const allowed = ALLOWED_STATUS_TRANSITIONS[from];
    if (!allowed?.includes(to)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `非法状态流转: ${from} → ${to}`,
      });
    }
  }

  private async assertAcyclicDependencies(
    companyId: string,
    proposedForTask: Array<{ taskId: string; dependsOnTaskId: string }>,
    replaceTaskId?: string,
  ): Promise<void> {
    const qb = this.taskDepsRepo
      .createQueryBuilder('d')
      .where('d.company_id = :companyId', { companyId });
    if (replaceTaskId) {
      qb.andWhere('d.task_id != :replaceTaskId', { replaceTaskId });
    }
    const existing = await qb.getMany();
    const edges = existing.map((d) => ({
      from: d.dependsOnTaskId,
      to: d.taskId,
    }));
    for (const p of proposedForTask) {
      edges.push({ from: p.dependsOnTaskId, to: p.taskId });
    }
    if (dependencyGraphHasCycle(edges)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '任务依赖存在环',
      });
    }
  }

  private async syncTaskDependencies(
    companyId: string,
    taskId: string,
    dependsOnTaskIds: string[] | undefined,
    actor: Actor,
  ): Promise<void> {
    if (dependsOnTaskIds === undefined) return;
    await this.assertAdmin(companyId, actor);
    const unique = [...new Set(dependsOnTaskIds)];
    for (const predId of unique) {
      if (predId === taskId) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '任务不能依赖自身',
        });
      }
      const pred = await this.tasksRepo.findOne({ where: { id: predId, companyId } });
      if (!pred) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: `前置任务不存在: ${predId}`,
        });
      }
    }
    const proposed = unique.map((dependsOnTaskId) => ({ taskId, dependsOnTaskId }));
    await this.assertAcyclicDependencies(companyId, proposed, taskId);
    await this.taskDepsRepo.delete({ companyId, taskId });
    if (unique.length) {
      await this.taskDepsRepo.insert(
        unique.map((dependsOnTaskId) => ({
          companyId,
          taskId,
          dependsOnTaskId,
        })),
      );
    }
  }

  private async assertDependenciesCompleted(
    companyId: string,
    taskId: string,
  ): Promise<void> {
    const preds = await this.taskDepsRepo.find({ where: { companyId, taskId } });
    if (!preds.length) return;
    const predIds = preds.map((p) => p.dependsOnTaskId);
    const rows = await this.tasksRepo.find({
      where: { companyId, id: In(predIds) },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const pid of predIds) {
      const r = byId.get(pid);
      if (!r || r.status !== 'completed') {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: `前置任务未完成，无法进入进行中: ${pid}`,
        });
      }
    }
  }

  private serializeTask(row: Task): Record<string, unknown> {
    return {
      id: row.id,
      companyId: row.companyId,
      parentId: row.parentId,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate?.toISOString() ?? null,
      expectedOutput: row.expectedOutput,
      progress: row.progress,
      assigneeType: row.assigneeType,
      assigneeId: row.assigneeId,
      skillIds: row.skillIds,
      blockedReason: row.blockedReason,
      requiresHumanApproval: row.requiresHumanApproval,
      metadata: row.metadata,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findAll(query: QueryTasksDto, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.tasksRepo
      .createQueryBuilder('t')
      .where('t.company_id = :companyId', { companyId })
      .orderBy('t.updated_at', 'DESC');

    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }
    if (query.parentId) {
      qb.andWhere('t.parent_id = :parentId', { parentId: query.parentId });
    }
    if (query.rootOnly) {
      qb.andWhere('t.parent_id IS NULL');
    }

    if (query.departmentOrganizationNodeId) {
      if (query.assigneeId || query.assigneeType) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: 'departmentOrganizationNodeId 与 assigneeId / assigneeType 不能同时使用',
        });
      }
      const treeVersion =
        (await this.cacheService.get<number>(getOrgTreeVersionCacheKey(companyId))) ?? 1;
      const subtreeCacheKey = getTaskDeptSubtreeCacheKey(
        companyId,
        treeVersion,
        query.departmentOrganizationNodeId,
      );
      const cachedSubtree = await this.cacheService.get<{ subIds: string[] }>(subtreeCacheKey);

      let subIds: string[];
      let subIdSet: Set<string>;

      if (cachedSubtree && Array.isArray(cachedSubtree.subIds)) {
        subIds = cachedSubtree.subIds;
        subIdSet = new Set(subIds);
      } else {
        const orgNodes = await this.nodesRepo.find({
          where: { companyId },
          select: ['id', 'parentId', 'type'],
        });
        const deptSelf = orgNodes.find((n) => n.id === query.departmentOrganizationNodeId);
        if (!deptSelf || deptSelf.type !== 'department') {
          throw new BadRequestException({
            code: ErrorCode.BAD_REQUEST,
            message: '无效的部门组织节点',
          });
        }
        subIdSet = collectDescendantOrgNodeIds(query.departmentOrganizationNodeId, orgNodes);
        subIds = [...subIdSet];
        await this.cacheService.set(
          subtreeCacheKey,
          { subIds },
          this.deptSubtreeCacheTtlSec,
        );
      }

      const agentRows = await this.agentsRepo.find({
        where: { companyId },
        select: ['id', 'organizationNodeId'],
      });
      const agentIds = agentRows
        .filter((a) => a.organizationNodeId && subIdSet.has(a.organizationNodeId))
        .map((a) => a.id);

      qb.andWhere(
        new Brackets((w) => {
          let any = false;
          if (subIds.length > 0) {
            w.where('(t.assignee_type = :deptNt AND t.assignee_id IN (:...deptSubIds))', {
              deptNt: 'organization_node',
              deptSubIds: subIds,
            });
            any = true;
          }
          if (agentIds.length > 0) {
            const cond =
              '(t.assignee_type = :deptAt AND t.assignee_id IN (:...deptAgentIds))';
            const params = { deptAt: 'agent' as const, deptAgentIds: agentIds };
            if (any) {
              w.orWhere(cond, params);
            } else {
              w.where(cond, params);
            }
            any = true;
          }
          if (!any) {
            w.where('1 = 0');
          }
        }),
      );
    } else {
      if (query.assigneeId) {
        qb.andWhere('t.assignee_id = :assigneeId', { assigneeId: query.assigneeId });
      }
      if (query.assigneeType) {
        qb.andWhere('t.assignee_type = :assigneeType', { assigneeType: query.assigneeType });
      }
    }

    const total = await qb.clone().getCount();
    const items = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      items: items.map((t) => this.serializeTask(t)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async findOne(id: string, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const task = await this.tasksRepo.findOne({ where: { id, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }
    return this.serializeTask(task);
  }

  async getTree(rootId: string, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `
      WITH RECURSIVE subtree AS (
        SELECT * FROM tasks WHERE id = $1 AND company_id = $2
        UNION ALL
        SELECT t.* FROM tasks t
        INNER JOIN subtree s ON t.parent_id = s.id
        WHERE t.company_id = $2
      )
      SELECT * FROM subtree ORDER BY created_at ASC
      `,
      [rootId, companyId],
    );
    if (!rows.length) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }
    return { rootId, nodes: rows.map((r) => this.serializeRawTaskRow(r)) };
  }

  /** DAG 依赖边（任务 A 依赖 B → edge taskId=A, dependsOnTaskId=B），供董事会视图叠加展示 */
  async listDependencyEdges(actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const rows = await this.taskDepsRepo.find({
      where: { companyId },
      order: { createdAt: 'ASC' },
    });
    return {
      edges: rows.map((r) => ({
        taskId: r.taskId,
        dependsOnTaskId: r.dependsOnTaskId,
      })),
    };
  }

  private serializeRawTaskRow(r: Record<string, unknown>): Record<string, unknown> {
    return {
      id: r.id,
      companyId: r.company_id,
      parentId: r.parent_id,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      dueDate: r.due_date ? new Date(r.due_date as string).toISOString() : null,
      expectedOutput: r.expected_output,
      progress: r.progress,
      assigneeType: r.assignee_type,
      assigneeId: r.assignee_id,
      skillIds: r.skill_ids,
      blockedReason: r.blocked_reason,
      requiresHumanApproval: r.requires_human_approval,
      metadata: r.metadata,
      createdByUserId: r.created_by_user_id,
      createdAt: new Date(r.created_at as string).toISOString(),
      updatedAt: new Date(r.updated_at as string).toISOString(),
    };
  }

  async create(
    dto: CreateTaskDto,
    actor: Actor,
    options?: { source?: 'manual' | 'collaboration_extract' | 'autonomous' },
  ) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertAdmin(companyId, actor);
    if (dto.parentId) {
      const parent = await this.tasksRepo.findOne({
        where: { id: dto.parentId, companyId },
      });
      if (!parent) {
        throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '父任务不存在' });
      }
    }
    if (dto.assigneeType && dto.assigneeType !== 'unassigned' && dto.assigneeId) {
      await this.validateAssignee(companyId, dto.assigneeType, dto.assigneeId);
    }
    const task = this.tasksRepo.create({
      companyId,
      parentId: dto.parentId ?? null,
      title: dto.title,
      description: dto.description ?? null,
      status: 'pending',
      priority: dto.priority ?? 'normal',
      dueDate: dto.dueDate ?? null,
      expectedOutput: dto.expectedOutput ?? null,
      progress: 0,
      assigneeType: dto.assigneeType ?? 'unassigned',
      assigneeId: dto.assigneeId ?? null,
      skillIds: dto.skillIds ?? null,
      requiresHumanApproval: dto.requiresHumanApproval ?? false,
      metadata: dto.metadata ?? null,
      createdByUserId: actor.id,
    });
    const saved = await this.tasksRepo.save(task);
    await this.syncTaskDependencies(companyId, saved.id, dto.dependsOnTaskIds, actor);
    if (saved.assigneeType !== 'unassigned' && saved.assigneeId) {
      await this.recordAssignment(saved, actor.id, null);
    }
    await this.publishCreated(saved, options?.source ?? 'manual');
    return this.serializeTask(saved);
  }

  /** 群聊抽取等内部创建路径：已有租户上下文 */
  async createFromEvent(
    dto: {
      title: string;
      description?: string;
      metadata?: Record<string, unknown>;
    },
    companyId: string,
    source: 'collaboration_extract' | 'bootstrap' = 'collaboration_extract',
  ): Promise<Task> {
    const task = this.tasksRepo.create({
      companyId,
      parentId: null,
      title: dto.title,
      description: dto.description ?? null,
      status: 'pending',
      priority: 'normal',
      dueDate: null,
      expectedOutput: null,
      progress: 0,
      assigneeType: 'unassigned',
      assigneeId: null,
      skillIds: null,
      requiresHumanApproval: false,
      metadata: dto.metadata ?? null,
      createdByUserId: null,
    });
    const saved = await this.tasksRepo.save(task);
    await this.publishCreated(saved, source);
    return saved;
  }

  async update(id: string, dto: UpdateTaskDto, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const task = await this.tasksRepo.findOne({ where: { id, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }
    if (dto.status === 'cancelled') {
      await this.assertAdmin(companyId, actor);
    }
    await this.syncTaskDependencies(companyId, id, dto.dependsOnTaskIds, actor);
    const before = { ...task };
    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description ?? null;
    if (dto.status !== undefined) {
      if (dto.status === 'in_progress' && task.status !== 'in_progress') {
        await this.assertDependenciesCompleted(companyId, id);
      }
      this.assertValidStatusTransition(task.status, dto.status);
      task.status = dto.status;
    }
    if (dto.priority !== undefined) task.priority = dto.priority;
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate;
    if (dto.expectedOutput !== undefined) task.expectedOutput = dto.expectedOutput ?? null;
    if (dto.progress !== undefined) task.progress = dto.progress;
    if (dto.blockedReason !== undefined) task.blockedReason = dto.blockedReason ?? null;
    if (dto.metadata !== undefined) {
      task.metadata = { ...(task.metadata ?? {}), ...dto.metadata };
    }
    const saved = await this.tasksRepo.save(task);
    await this.publishUpdated(before, saved);
    if (dto.progress !== undefined || dto.status !== undefined) {
      await this.publishProgress(saved);
    }
    if (saved.status === 'blocked' && before.status !== 'blocked') {
      await this.publishBlocked(saved);
    }
    await this.maybeNotifyHumanApproval(saved);
    if (dto.status === 'completed' && before.status !== 'completed') {
      await this.publishCompleted(saved);
      if (saved.parentId) {
        await this.maybeRollupParentAfterChildCompleted(saved);
      } else {
        await this.publishSummaryIfRootDone(saved);
      }
    }
    return this.serializeTask(saved);
  }

  async assign(id: string, dto: AssignTaskDto, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const task = await this.tasksRepo.findOne({ where: { id, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }
    if (dto.assigneeType !== 'unassigned' && dto.assigneeId) {
      await this.validateAssignee(companyId, dto.assigneeType, dto.assigneeId);
    }
    await this.closeOpenAssignment(task.id, companyId);
    task.assigneeType = dto.assigneeType;
    task.assigneeId = dto.assigneeId ?? null;
    if (task.status === 'pending') {
      await this.assertDependenciesCompleted(companyId, task.id);
      this.assertValidStatusTransition(task.status, 'in_progress');
      task.status = 'in_progress';
    }
    const saved = await this.tasksRepo.save(task);
    if (saved.assigneeType !== 'unassigned' && saved.assigneeId) {
      await this.recordAssignment(saved, actor.id, dto.note ?? null);
    }
    await this.publishUpdated(task, saved);
    await this.publishProgress(saved);
    return this.serializeTask(saved);
  }

  async updateProgress(id: string, dto: UpdateProgressDto, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    const task = await this.tasksRepo.findOne({ where: { id, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }
    await this.assertCanUpdateProgress(companyId, task, actor);

    // HITL 最佳实践：如果任务要求人工复核（review），则放行/拒绝必须带 approvalId 且必须匹配任务元数据。
    if (task.requiresHumanApproval && task.status === 'review') {
      if (!dto.status) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: 'review 状态下必须显式提供目标 status',
        });
      }
      const meta = (task.metadata ?? {}) as Record<string, unknown>;
      const expectedApprovalId =
        typeof meta.taskReviewApprovalId === 'string' ? (meta.taskReviewApprovalId as string) : null;
      if (!expectedApprovalId) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'review 状态的 approvalId 不存在或已失效',
        });
      }
      if (!dto.approvalId || dto.approvalId !== expectedApprovalId) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'approvalId 不匹配，拒绝放行',
        });
      }

      // 记录决策（写入 metadata，避免 multi-instance 依赖进程内存）
      const resolvedAt = new Date().toISOString();
      const decision =
        dto.status === 'in_progress' ? 'approved' : dto.status === 'blocked' ? 'rejected' : 'rejected';

      task.metadata = {
        ...meta,
        taskReviewApprovalDecision: decision,
        taskReviewApprovalResolvedAt: resolvedAt,
        taskReviewApprovalResolvedBy: actor.id,
      };
    }

    const before = { ...task };
    if (dto.progress !== undefined) task.progress = dto.progress;
    if (dto.status !== undefined) {
      if (dto.status === 'in_progress' && task.status !== 'in_progress') {
        await this.assertDependenciesCompleted(companyId, task.id);
      }
      this.assertValidStatusTransition(task.status, dto.status);
      task.status = dto.status;
    }
    if (dto.blockedReason !== undefined) task.blockedReason = dto.blockedReason ?? null;
    const saved = await this.tasksRepo.save(task);
    await this.publishUpdated(before, saved);
    await this.publishProgress(saved);
    if (saved.status === 'blocked' && before.status !== 'blocked') {
      await this.publishBlocked(saved);
    }
    await this.maybeNotifyHumanApproval(saved);
    if (saved.status === 'completed' && before.status !== 'completed') {
      await this.publishCompleted(saved);
      if (saved.parentId) {
        await this.maybeRollupParentAfterChildCompleted(saved);
      } else {
        await this.publishSummaryIfRootDone(saved);
      }
    }
    return this.serializeTask(saved);
  }

  async remove(id: string, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertAdmin(companyId, actor);
    const task = await this.tasksRepo.findOne({ where: { id, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }
    await this.tasksRepo.remove(task);
    return { ok: true };
  }

  private async validateAssignee(
    companyId: string,
    assigneeType: 'agent' | 'organization_node',
    assigneeId: string,
  ): Promise<void> {
    if (assigneeType === 'agent') {
      const agent = await this.agentsRepo.findOne({ where: { id: assigneeId, companyId } });
      if (!agent) {
        throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Agent 不存在' });
      }
    }
    // organization_node：存在性由 Organization 模块保证；此处仅避免明显错误
  }

  private async closeOpenAssignment(taskId: string, companyId: string): Promise<void> {
    await this.assignmentsRepo
      .createQueryBuilder()
      .update(TaskAssignment)
      .set({ unassignedAt: new Date() })
      .where('task_id = :taskId', { taskId })
      .andWhere('company_id = :companyId', { companyId })
      .andWhere('unassigned_at IS NULL')
      .execute();
  }

  private async recordAssignment(task: Task, userId: string, note: string | null): Promise<void> {
    const row = this.assignmentsRepo.create({
      companyId: task.companyId,
      taskId: task.id,
      assigneeType: task.assigneeType,
      assigneeId: task.assigneeId,
      assignedByUserId: userId,
      note,
    });
    await this.assignmentsRepo.save(row);
  }

  private async publishCreated(
    task: Task,
    source: 'manual' | 'collaboration_extract' | 'breakdown' | 'bootstrap' | 'autonomous',
  ): Promise<void> {
    try {
      const event: TaskCreatedEvent = {
        eventId: randomUUID(),
        eventType: 'task.created',
        aggregateId: task.id,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: task.companyId,
        data: {
          taskId: task.id,
          companyId: task.companyId,
          parentId: task.parentId ?? undefined,
          title: task.title,
          status: task.status,
          source,
          createdAt: task.createdAt.toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'task.created',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish task.created failed', { message: e?.message });
    }
  }

  private async publishProgress(task: Task): Promise<void> {
    try {
      const event: TaskProgressUpdatedEvent = {
        eventId: randomUUID(),
        eventType: 'task.progress.updated',
        aggregateId: task.id,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: task.companyId,
        data: {
          taskId: task.id,
          companyId: task.companyId,
          progress: task.progress,
          status: task.status,
          updatedAt: task.updatedAt.toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'task.progress.updated',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish task.progress.updated failed', { message: e?.message });
    }
    await this.pushTaskProgressRealtime(task);
    await this.maybePublishRoomTaskProgress(task);
  }

  private async pushTaskProgressRealtime(task: Task): Promise<void> {
    try {
      await this.collabRealtime.publishEnvelope({
        event: 'task:progress',
        companyId: task.companyId,
        payload: {
          taskId: task.id,
          progress: task.progress,
          status: task.status,
          parentId: task.parentId,
          updatedAt: task.updatedAt.toISOString(),
        },
      });
    } catch (e: any) {
      this.logger.warn('task progress redis notify failed', { message: e?.message });
    }
  }

  private async maybePublishRoomTaskProgress(task: Task): Promise<void> {
    const roomId = task.metadata?.roomId;
    if (typeof roomId !== 'string' || !roomId.trim()) return;
    try {
      await this.collabRealtime.publishEnvelope({
        event: 'task:room_progress',
        companyId: task.companyId,
        roomId,
        payload: {
          taskId: task.id,
          progress: task.progress,
          status: task.status,
          title: task.title,
        },
      });
    } catch (e: any) {
      this.logger.warn('task room progress redis notify failed', { message: e?.message });
    }
  }

  private async maybeNotifyHumanApproval(task: Task): Promise<void> {
    const roomId = task.metadata?.roomId;
    if (typeof roomId !== 'string' || !roomId.trim()) return;
    if (!task.requiresHumanApproval || task.status !== 'review') return;
    try {
      // Best practice：为每次 review 生成并持久化 approvalId，后续放行/拒绝只能用该令牌。
      const prevMeta = (task.metadata ?? {}) as Record<string, unknown>;
      const existingApprovalId =
        typeof prevMeta.taskReviewApprovalId === 'string'
          ? (prevMeta.taskReviewApprovalId as string)
          : undefined;
      const approvalId = existingApprovalId ?? randomUUID();

      if (!existingApprovalId) {
        task.metadata = {
          ...prevMeta,
          taskReviewApprovalId: approvalId,
          taskReviewApprovalRequestedAt: new Date().toISOString(),
          taskReviewApprovalDecision: 'pending',
        };
        await this.tasksRepo.save(task);
      }

      await this.collabApproval.pushToRoom({
        companyId: task.companyId,
        roomId,
        agentId: task.assigneeId ?? 'task',
        reason: '任务进入复核，需要人工确认后继续',
        approvalId,
        metadata: { taskId: task.id, kind: 'task_review' },
      });
    } catch (e: any) {
      this.logger.warn('task approval push failed', { message: e?.message });
    }
  }

  private async publishBlocked(task: Task): Promise<void> {
    try {
      const event: TaskBlockedEvent = {
        eventId: randomUUID(),
        eventType: 'task.blocked',
        aggregateId: task.id,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: task.companyId,
        data: {
          taskId: task.id,
          companyId: task.companyId,
          reason: task.blockedReason ?? undefined,
          blockedAt: task.updatedAt.toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'task.blocked',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish task.blocked failed', { message: e?.message });
    }
  }

  private async publishSummaryGenerated(
    task: Task,
    summary: string,
    childTaskCount?: number,
  ): Promise<void> {
    try {
      const event: TaskSummaryGeneratedEvent = {
        eventId: randomUUID(),
        eventType: 'task.summary.generated',
        aggregateId: task.id,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: task.companyId,
        data: {
          taskId: task.id,
          companyId: task.companyId,
          summary,
          childTaskCount,
          generatedAt: new Date().toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'task.summary.generated',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish task.summary.generated failed', { message: e?.message });
    }
  }

  private async publishSummaryIfRootDone(task: Task): Promise<void> {
    if (task.parentId || task.status !== 'completed') return;
    const children = await this.tasksRepo.find({
      where: { parentId: task.id, companyId: task.companyId },
    });
    const n = children.length;
    const summary =
      n > 0
        ? `根任务「${task.title}」已完成；共 ${n} 个子任务，全部完成或已汇总。`
        : `根任务「${task.title}」已完成。`;
    await this.publishSummaryGenerated(task, summary, n || undefined);
  }

  private async maybeRollupParentAfterChildCompleted(child: Task): Promise<void> {
    if (!child.parentId || child.status !== 'completed') return;
    const parent = await this.tasksRepo.findOne({
      where: { id: child.parentId, companyId: child.companyId },
    });
    if (!parent) return;
    const children = await this.tasksRepo.find({
      where: { parentId: parent.id, companyId: parent.companyId },
    });
    if (!children.length) return;
    const completed = children.filter((c) => c.status === 'completed').length;
    const progress = Math.round((completed / children.length) * 100);
    const before = { ...parent };
    parent.progress = progress;
    if (completed === children.length) {
      parent.status = 'completed';
    } else if (parent.status === 'pending' && completed > 0) {
      parent.status = 'in_progress';
    }
    const savedParent = await this.tasksRepo.save(parent);
    await this.publishUpdated(before, savedParent);
    await this.publishProgress(savedParent);
    if (savedParent.status === 'completed' && before.status !== 'completed') {
      await this.publishCompleted(savedParent);
      if (!savedParent.parentId) {
        await this.publishSummaryIfRootDone(savedParent);
      }
      if (savedParent.parentId) {
        await this.maybeRollupParentAfterChildCompleted(savedParent);
      }
    }
  }

  private async publishCompleted(task: Task): Promise<void> {
    try {
      const event: TaskCompletedEvent = {
        eventId: randomUUID(),
        eventType: 'task.completed',
        aggregateId: task.id,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: task.companyId,
        data: {
          taskId: task.id,
          companyId: task.companyId,
          parentId: task.parentId ?? undefined,
          completedAt: task.updatedAt.toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'task.completed',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish task.completed failed', { message: e?.message });
    }
  }

  private async publishUpdated(before: Task, after: Task): Promise<void> {
    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(after) as (keyof Task)[]) {
      if (before[key] !== after[key]) {
        changes[key as string] = after[key];
      }
    }
    if (Object.keys(changes).length === 0) return;
    try {
      const event: TaskUpdatedEvent = {
        eventId: randomUUID(),
        eventType: 'task.updated',
        aggregateId: after.id,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: after.companyId,
        data: {
          taskId: after.id,
          companyId: after.companyId,
          changes,
          updatedAt: after.updatedAt.toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'task.updated',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish task.updated failed', { message: e?.message });
    }
  }
}
