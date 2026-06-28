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
  TaskAssignedEvent,
  TaskBlockedEvent,
  TaskCompletedEvent,
  TaskCreatedEvent,
  TaskEscalationRequestedEvent,
  TaskGovernanceSummaryGeneratedEvent,
  TaskProgressUpdatedEvent,
  TaskReportGeneratedEvent,
  TaskSummaryGeneratedEvent,
  TaskUpdatedEvent,
  TaskDomainStatus,
} from '@contracts/events';
import { DEPT_PIPELINE_KIND, type DeptTaskPipelineParentMetadata } from '@contracts/types';
import { ChatMessageService } from '../../collaboration/services/chat-message.service.js';
import { ChatRoomService } from '../../collaboration/services/chat-room.service.js';
import { DiscussionThreadService } from '../../collaboration/services/discussion-thread.service.js';
import { RoomMemberService } from '../../collaboration/services/room-member.service.js';
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
import { ConfigService } from '../../../common/config/config.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

/** 合法状态迁移（不含保持不变） */
const ALLOWED_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'review', 'awaiting_approval', 'blocked', 'cancelled', 'paused', 'queued'],
  queued: ['pending', 'in_progress', 'cancelled'],
  in_progress: [
    'review',
    'awaiting_approval',
    'awaiting_supervision',
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
    'awaiting_supervision',
    'blocked',
    'cancelled',
    'paused',
  ],
  awaiting_approval: ['in_progress', 'completed', 'blocked', 'cancelled', 'review', 'paused'],
  awaiting_supervision: ['in_progress', 'completed', 'blocked', 'cancelled', 'review'],
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
    private readonly chatRooms: ChatRoomService,
    private readonly chatMessages: ChatMessageService,
    private readonly discussionThreads: DiscussionThreadService,
    private readonly roomMembers: RoomMemberService,
    private readonly config: ConfigService,
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
    options?: {
      source?: 'manual' | 'collaboration_extract' | 'autonomous' | 'bootstrap';
      trustedInternal?: boolean;
    },
  ) {
    const companyId = this.getCompanyIdOrThrow();
    if (!options?.trustedInternal) {
      await this.assertAdmin(companyId, actor);
    }
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

  async assertCanManageDepartmentPipeline(companyId: string, actor: Actor): Promise<void> {
    await this.assertAdmin(companyId, actor);
  }

  async delegateByDirector(
    taskId: string,
    input: {
      directorAgentId: string;
      assigneeAgentId: string;
      title: string;
      description?: string;
      successCriteria?: string[];
      priority?: Task['priority'];
    },
    actor: Actor,
  ): Promise<Record<string, unknown>> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);

    const parent = await this.tasksRepo.findOne({ where: { id: taskId, companyId } });
    if (!parent) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '父任务不存在' });
    }

    const director = await this.agentsRepo.findOne({
      where: { id: input.directorAgentId, companyId },
    });
    const subordinate = await this.agentsRepo.findOne({
      where: { id: input.assigneeAgentId, companyId },
    });
    if (!director || !subordinate) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Director 或下属 Agent 不存在' });
    }

    if (subordinate.reportsToAgentId && subordinate.reportsToAgentId !== input.directorAgentId) {
      const subNode = subordinate.organizationNodeId
        ? await this.nodesRepo.findOne({ where: { id: subordinate.organizationNodeId, companyId } })
        : null;
      const dirNode = director.organizationNodeId
        ? await this.nodesRepo.findOne({ where: { id: director.organizationNodeId, companyId } })
        : null;
      if (!subNode || subNode.parentId !== dirNode?.id) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: '仅允许委派给直属下属',
        });
      }
    }

    const child = this.tasksRepo.create({
      companyId,
      parentId: taskId,
      title: input.title,
      description: input.description ?? null,
      status: 'pending',
      priority: input.priority ?? parent.priority ?? 'normal',
      dueDate: null,
      expectedOutput: input.successCriteria?.length ? input.successCriteria.join('；') : null,
      progress: 0,
      assigneeType: 'agent',
      assigneeId: input.assigneeAgentId,
      skillIds: null,
      requiresHumanApproval: false,
      metadata: input.successCriteria?.length ? { successCriteria: input.successCriteria } : null,
      createdByUserId: actor.id,
    });
    const saved = await this.tasksRepo.save(child);
    await this.recordAssignment(saved, actor.id, null);
    await this.publishCreated(saved, 'manual');

    try {
      const event: TaskAssignedEvent = {
        eventId: randomUUID(),
        eventType: 'task.assigned',
        aggregateId: saved.id,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          taskId: saved.id,
          companyId,
          assigneeType: 'agent',
          assigneeId: input.assigneeAgentId,
          assignedByUserId: actor.id,
          assignedAt: new Date().toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'task.assigned',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish task.assigned failed', { message: e?.message });
    }

    return this.serializeTask(saved);
  }

  async submitDirectorReview(
    taskId: string,
    input: {
      reviewerAgentId: string;
      qualityScore: number;
      overallAssessment: string;
      approveToProceed: boolean;
      performanceImpact?: string;
    },
    actor: Actor,
  ): Promise<void> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const task = await this.tasksRepo.findOne({ where: { id: taskId, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }

    await this.messagingService.publish(
      {
        eventId: randomUUID(),
        eventType: 'task.reviewed.by_director',
        aggregateId: taskId,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          companyId,
          taskId,
          reviewerAgentId: input.reviewerAgentId,
          assigneeAgentId: task.assigneeId,
          qualityScore: input.qualityScore,
          overallAssessment: input.overallAssessment,
          approveToProceed: input.approveToProceed,
          performanceImpact: input.performanceImpact ?? null,
        },
      },
      { routingKey: 'task.reviewed.by_director', persistent: true },
    );
  }

  async listDelegationCandidates(
    taskId: string,
    opts: { roomId: string | null; limit?: number },
    actor: Actor,
  ): Promise<{
    items: Array<{
      agentId: string;
      agentName: string;
      directReport: boolean;
      activeCount: number;
      blockedCount: number;
      inProgressCount: number;
    }>;
  }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const task = await this.tasksRepo.findOne({ where: { id: taskId, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }
    if (opts.roomId) {
      await this.assertActiveHumanRoomMember(companyId, opts.roomId, actor);
    }

    const directorId = task.assigneeType === 'agent' ? task.assigneeId : null;
    if (!directorId) return { items: [] };

    const director = await this.agentsRepo.findOne({ where: { id: directorId, companyId } });
    if (!director) return { items: [] };

    let candidateIds: string[] = [];
    if (opts.roomId) {
      const members = await this.roomMembers.listActiveMembers(companyId, opts.roomId);
      candidateIds = members
        .filter((m) => m.memberType === 'agent')
        .map((m) => m.memberId)
        .filter(Boolean);
    } else {
      const subs = await this.agentsRepo.find({
        where: { companyId, reportsToAgentId: directorId, status: 'active' },
        select: ['id'],
      });
      candidateIds = subs.map((s) => s.id);
    }
    if (!candidateIds.length) return { items: [] };

    const agents = await this.agentsRepo.find({
      where: { companyId, id: In(candidateIds), status: 'active' },
    });
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);

    const statsRows = await this.tasksRepo
      .createQueryBuilder('t')
      .select('t.assignee_id', 'assigneeId')
      .addSelect(
        `SUM(CASE WHEN t.status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END)`,
        'activeCount',
      )
      .addSelect(`SUM(CASE WHEN t.status = 'blocked' THEN 1 ELSE 0 END)`, 'blockedCount')
      .addSelect(`SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END)`, 'inProgressCount')
      .where('t.company_id = :companyId', { companyId })
      .andWhere('t.assignee_type = :assigneeType', { assigneeType: 'agent' })
      .andWhere('t.assignee_id IN (:...candidateIds)', { candidateIds })
      .groupBy('t.assignee_id')
      .getRawMany<{
        assigneeId: string;
        activeCount: string;
        blockedCount: string;
        inProgressCount: string;
      }>();
    const statsByAgent = new Map(statsRows.map((r) => [r.assigneeId, r]));

    const items = agents
      .map((agent) => {
        const stats = statsByAgent.get(agent.id);
        return {
          agentId: agent.id,
          agentName: agent.name,
          directReport: agent.reportsToAgentId === directorId,
          activeCount: Number(stats?.activeCount ?? 0),
          blockedCount: Number(stats?.blockedCount ?? 0),
          inProgressCount: Number(stats?.inProgressCount ?? 0),
        };
      })
      .sort((a, b) => {
        if (a.directReport !== b.directReport) return a.directReport ? -1 : 1;
        return a.activeCount - b.activeCount;
      })
      .slice(0, limit);

    return { items };
  }

  async closeGoalRound(
    goalTaskId: string,
    data: {
      reason?: string;
      closeBy?: string;
      status?: TaskStatus;
    },
    actor: Actor,
  ): Promise<Record<string, unknown>> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const task = await this.tasksRepo.findOne({ where: { id: goalTaskId, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '目标任务不存在' });
    }
    const meta = (task.metadata ?? {}) as Record<string, unknown>;
    if (String(meta.goalLevel ?? '') !== 'main') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '仅主群 goalLevel=main 的任务可结案轮次',
      });
    }

    const targetStatus = data.status ?? 'completed';
    const before = { ...task };
    this.assertValidStatusTransition(task.status, targetStatus);
    task.status = targetStatus;
    if (targetStatus === 'completed') task.progress = 100;
    task.metadata = {
      ...meta,
      roundClosedAt: new Date().toISOString(),
      ...(data.reason ? { roundCloseReason: data.reason } : {}),
      ...(data.closeBy ? { roundClosedBy: data.closeBy } : {}),
    };
    const saved = await this.tasksRepo.save(task);
    await this.publishUpdated(before, saved);
    await this.publishProgress(saved);
    if (saved.status === 'completed' && before.status !== 'completed') {
      await this.publishCompleted(saved);
    }
    return this.serializeTask(saved);
  }

  async resolveDepartmentPipelineSupervision(
    companyId: string,
    actor: Actor,
    data: {
      parentTaskId: string;
      decision: 'pass' | 'fail' | 'human_required';
      summary?: string;
      failureReason?: string;
    },
  ): Promise<Record<string, unknown>> {
    const resolvedCompanyId = String(companyId ?? this.getCompanyIdOrThrow()).trim();
    if (!actor?.roles?.includes('admin')) {
      await this.assertAdmin(resolvedCompanyId, actor);
    }

    const parent = await this.tasksRepo.findOne({
      where: { id: data.parentTaskId, companyId: resolvedCompanyId },
    });
    if (!parent) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '父任务不存在' });
    }

    const meta = (parent.metadata ?? {}) as Record<string, unknown>;
    const dp = meta.deptPipeline as DeptTaskPipelineParentMetadata | undefined;
    if (!dp || dp.kind !== DEPT_PIPELINE_KIND) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '父任务未启用部门编排元数据',
      });
    }

    const supervisionState =
      data.decision === 'pass'
        ? 'passed'
        : data.decision === 'fail'
          ? 'failed'
          : 'human_required';
    const before = { ...parent };
    const nextPipeline: DeptTaskPipelineParentMetadata = {
      ...dp,
      supervision: {
        ...dp.supervision,
        state: supervisionState,
        decidedAt: new Date().toISOString(),
        summary: data.summary,
        failureReason: data.failureReason,
      },
    };
    parent.metadata = { ...meta, deptPipeline: nextPipeline };

    if (data.decision === 'pass' && parent.status === 'awaiting_supervision') {
      this.assertValidStatusTransition(parent.status, 'completed');
      parent.status = 'completed';
      parent.progress = 100;
    }

    const saved = await this.tasksRepo.save(parent);
    await this.publishUpdated(before, saved);
    await this.publishProgress(saved);
    if (saved.status === 'completed' && before.status !== 'completed') {
      await this.publishCompleted(saved);
      if (!saved.parentId) {
        await this.publishSummaryIfRootDone(saved);
      }
    }
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

  private toGoalCard(row: Task): Record<string, unknown> {
    return {
      id: row.id,
      parentId: row.parentId,
      title: row.title,
      status: row.status,
      progress: row.progress,
      assigneeId: row.assigneeId,
      metadata: row.metadata,
    };
  }

  /**
   * 按协作房间列出目标卡片（主目标 / 部门子目标）。
   * 主目标：`metadata.goalLevel=main` 且 `roomId` 或 `goalCoordinationRoomId` 匹配；
   * 子目标：`metadata.goalLevel=sub` 且 `goalTargetRoomId` 匹配。
   */
  async listGoalCardsByRoom(
    roomId: string,
    goalLevel: 'main' | 'sub' | null,
    actor: Actor,
    opts?: { sinceUpdatedAt?: Date; sourceMessageId?: string },
  ): Promise<{ items: Record<string, unknown>[] }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const trimmedRoomId = roomId.trim();
    if (!trimmedRoomId) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'roomId 不能为空' });
    }

    const qb = this.tasksRepo
      .createQueryBuilder('t')
      .where('t.company_id = :companyId', { companyId })
      .andWhere(`COALESCE(t.metadata->>'goalLevel', '') IN ('main', 'sub')`);

    if (goalLevel === 'main') {
      qb.andWhere(`t.metadata->>'goalLevel' = 'main'`).andWhere(
        `(t.metadata->>'roomId' = :roomId OR t.metadata->>'goalCoordinationRoomId' = :roomId)`,
        { roomId: trimmedRoomId },
      );
    } else if (goalLevel === 'sub') {
      qb.andWhere(`t.metadata->>'goalLevel' = 'sub'`).andWhere(
        `t.metadata->>'goalTargetRoomId' = :roomId`,
        { roomId: trimmedRoomId },
      );
    } else {
      qb.andWhere(
        new Brackets((w) => {
          w.where(
            `(t.metadata->>'goalLevel' = 'main' AND (t.metadata->>'roomId' = :roomId OR t.metadata->>'goalCoordinationRoomId' = :roomId))`,
            { roomId: trimmedRoomId },
          ).orWhere(
            `(t.metadata->>'goalLevel' = 'sub' AND t.metadata->>'goalTargetRoomId' = :roomId)`,
            { roomId: trimmedRoomId },
          );
        }),
      );
    }

    if (opts?.sinceUpdatedAt) {
      qb.andWhere('t.updated_at >= :sinceUpdatedAt', { sinceUpdatedAt: opts.sinceUpdatedAt });
    }
    if (opts?.sourceMessageId?.trim()) {
      qb.andWhere(`t.metadata->>'sourceMessageId' = :sourceMessageId`, {
        sourceMessageId: opts.sourceMessageId.trim(),
      });
    }

    const rows = await qb.orderBy('t.updated_at', 'DESC').getMany();
    return { items: rows.map((row) => this.toGoalCard(row)) };
  }

  /** Worker / 内部管线：确保主群主目标存在（幂等键 `metadata.idempotencyKey`）。 */
  async ensureMainGoalFromPipeline(
    data: {
      roomId: string;
      sourceMessageId: string;
      title: string;
      description?: string | null;
      doneConditions?: string[];
      roundId?: string | null;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      idempotencyKey: string;
    },
    actor: Actor,
  ): Promise<Record<string, unknown>> {
    return this.ensureMainGoalInternal(data, actor, null);
  }

  /** 协作主群：代活跃成员创建主目标（`createdByUserId` = attributedUserId）。 */
  async ensureMainGoalFromCollaborationPipeline(
    data: {
      roomId: string;
      sourceMessageId: string;
      title: string;
      description?: string | null;
      doneConditions?: string[];
      roundId?: string | null;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      idempotencyKey: string;
      attributedUserId: string;
    },
    actor: Actor,
  ): Promise<Record<string, unknown>> {
    const uid = String(data.attributedUserId ?? '').trim();
    if (!uid) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'attributedUserId 不能为空',
      });
    }
    return this.ensureMainGoalInternal(data, actor, uid);
  }

  /**
   * 主群 L2 分发：在主目标下创建部门子目标（`goalLevel=sub`），按 `goalDelegationKey` 幂等。
   */
  async assignGoalToDepartmentDirector(
    parentGoalTaskId: string,
    data: {
      departmentRoomId: string;
      directorAgentId: string;
      title?: string;
      description?: string | null;
      doneConditions?: string[];
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      dueDate?: string | null;
      sourceMessageId?: string | null;
      goalDelegationKey?: string;
      attributedUserId?: string;
      distributionPlanTaskId?: string;
      distributionDependsOnTaskIds?: string[];
      executionProfile?: string;
    },
    actor: Actor,
  ): Promise<Record<string, unknown>> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertWorkerOrAdminGoalActor(companyId, actor);

    const parentId = String(parentGoalTaskId ?? '').trim();
    if (!parentId) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '主目标任务 id 不能为空' });
    }
    const parent = await this.tasksRepo.findOne({ where: { id: parentId, companyId } });
    if (!parent) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '主目标任务不存在' });
    }

    const delegationKey = String(data.goalDelegationKey ?? '').trim();
    if (delegationKey) {
      const existing = await this.findSubGoalByDelegationKey(companyId, parentId, delegationKey);
      if (existing) {
        return this.serializeTask(existing);
      }
    }

    const directorId = String(data.directorAgentId ?? '').trim();
    const deptRoomId = String(data.departmentRoomId ?? '').trim();
    if (!directorId || !deptRoomId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'departmentRoomId 与 directorAgentId 不能为空',
      });
    }
    await this.validateAssignee(companyId, 'agent', directorId);

    const attributedUserId = String(data.attributedUserId ?? '').trim();
    if (attributedUserId) {
      await this.assertActiveMemberUserId(companyId, attributedUserId);
    }

    const done = (data.doneConditions ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);
    const title = String(data.title ?? '').trim().slice(0, 512) || '部门协作子目标';
    const description = String(data.description ?? '').trim() || null;
    const metadata: Record<string, unknown> = {
      goalLevel: 'sub',
      goalTargetRoomId: deptRoomId,
      parentGoalTaskId: parentId,
      ...(data.sourceMessageId?.trim() ? { sourceMessageId: data.sourceMessageId.trim() } : {}),
      ...(delegationKey ? { goalDelegationKey: delegationKey } : {}),
      ...(delegationKey.startsWith('main_room_l2:')
        ? { requiresDeliverable: true, departmentRoomId: deptRoomId }
        : {}),
      ...(data.distributionPlanTaskId?.trim()
        ? { distributionPlanTaskId: data.distributionPlanTaskId.trim() }
        : {}),
      ...(Array.isArray(data.distributionDependsOnTaskIds) && data.distributionDependsOnTaskIds.length
        ? {
            distributionDependsOnTaskIds: data.distributionDependsOnTaskIds
              .map((x) => String(x ?? '').trim())
              .filter(Boolean)
              .slice(0, 32),
          }
        : {}),
      ...(data.executionProfile?.trim() ? { executionProfile: data.executionProfile.trim() } : {}),
    };

    const task = this.tasksRepo.create({
      companyId,
      parentId,
      title,
      description,
      status: 'in_progress',
      priority: data.priority ?? parent.priority ?? 'normal',
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      expectedOutput: done.length ? done.join('；').slice(0, 4000) : description,
      progress: 0,
      assigneeType: 'agent',
      assigneeId: directorId,
      skillIds: null,
      requiresHumanApproval: false,
      metadata,
      createdByUserId: attributedUserId || null,
    });
    const saved = await this.tasksRepo.save(task);
    await this.recordAssignment(saved, actor.id, null);
    await this.publishCreated(saved, 'autonomous');
    await this.publishProgress(saved);
    return this.serializeTask(saved);
  }

  /**
   * 任务详情 → 下发到部门群：系统消息 + `department_dispatch` 富卡片，可选 execution 线程。
   */
  async dispatchTaskToDepartmentRoom(
    taskId: string,
    data: {
      departmentRoomId: string;
      fromRoomId?: string | null;
      fromMessageId?: string | null;
      reportBackRoomId?: string | null;
      createThread?: boolean;
      threadTitle?: string | null;
      /** false 时仅创建 thread + 更新 task metadata，不写部门群系统派单卡 */
      postChatMessage?: boolean;
    },
    actor: Actor,
  ): Promise<{ roomId: string; threadId: string | null; messageId: string | null }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);

    const task = await this.tasksRepo.findOne({ where: { id: taskId, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }

    const deptRoomId = String(data.departmentRoomId ?? '').trim();
    if (!deptRoomId) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'departmentRoomId 不能为空' });
    }

    const deptRoom = await this.chatRooms.findOneOrFail(companyId, deptRoomId);
    if (deptRoom.roomType !== 'department') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '目标房间须为部门群',
      });
    }

    await this.assertActiveHumanRoomMember(companyId, deptRoomId, actor);

    const fromRoomId = String(data.fromRoomId ?? '').trim();
    if (fromRoomId) {
      await this.assertActiveHumanRoomMember(companyId, fromRoomId, actor);
    }

    let mainRoomId = String(data.reportBackRoomId ?? '').trim();
    if (!mainRoomId) {
      const main = await this.chatRooms.findMainRoom(companyId);
      mainRoomId = main?.id?.trim() ?? '';
    }

    let threadId: string | null = null;
    if (data.createThread !== false) {
      const thread = await this.discussionThreads.create(companyId, deptRoomId, {
        title: String(data.threadTitle ?? task.title ?? '任务执行').trim().slice(0, 512) || '任务执行',
        collaborationMode: 'execution',
      });
      threadId = thread.id;
      await this.discussionThreads.mergeMetadata(companyId, thread.id, {
        taskId: task.id,
        source: 'task_dispatch',
        parentTaskId: task.parentId ?? null,
      });
    }

    const meta = (task.metadata ?? {}) as Record<string, unknown>;
    const acceptanceCriteria = Array.isArray(meta.doneConditions)
      ? meta.doneConditions.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 12)
      : task.expectedOutput
        ? [String(task.expectedOutput).slice(0, 500)]
        : null;

    const richCard = {
      cardType: 'department_dispatch',
      taskId: task.id,
      title: task.title,
      status: task.status,
      dueAt: task.dueDate?.toISOString() ?? null,
      ownerOrgNodeId: deptRoom.organizationNodeId ?? null,
      acceptanceCriteria,
      dispatch: {
        fromRoomId: fromRoomId || null,
        fromMessageId: data.fromMessageId?.trim() || null,
      },
      reportBackRoomId: mainRoomId || null,
      sourceRoomId: fromRoomId || null,
      sourceThreadId: threadId,
    };

    const postChatMessage =
      data.postChatMessage ?? this.config.isCollabDeptDispatchSystemCardEnabled();

    let messageId: string | null = null;
    if (postChatMessage) {
      const content =
        `【部门任务下发】${task.title}\n` +
        (task.description ? `${String(task.description).slice(0, 800)}\n` : '') +
        `请在部门群内同步进展；完成后由主管汇总并向主群回报。`.slice(0, 4000);

      const msg = await this.chatMessages.appendSystemMessageAsActor(
        companyId,
        deptRoomId,
        actor.id,
        content,
        {
          source: 'task_dispatch',
          taskId: task.id,
          richCard,
          threadId,
        },
      );
      messageId = msg.id;
    }

    task.metadata = {
      ...meta,
      goalTargetRoomId: deptRoomId,
      lastDispatchRoomId: deptRoomId,
      lastDispatchThreadId: threadId,
      ...(messageId ? { lastDispatchMessageId: messageId } : {}),
      source: 'task_dispatch',
    };
    const before = { ...task };
    await this.tasksRepo.save(task);
    await this.publishUpdated(before, task);

    return { roomId: deptRoomId, threadId, messageId };
  }

  /**
   * 部门汇总 → 主群回报（Owner/Admin 或系统 Admin actor）。
   */
  async reportTaskToMainRoom(
    taskId: string,
    data: {
      mainRoomId?: string | null;
      sourceRoomId?: string | null;
      sourceThreadId?: string | null;
      summary: string;
    },
    actor: Actor,
  ): Promise<{ roomId: string; messageId: string }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    if (!(actor.roles?.includes('admin') || (await this.isCompanyOwnerOrAdmin(companyId, actor)))) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅 Owner/Admin 可向主群提交汇总回报',
      });
    }

    const task = await this.tasksRepo.findOne({ where: { id: taskId, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }

    let mainRoomId = String(data.mainRoomId ?? '').trim();
    if (!mainRoomId) {
      const main = await this.chatRooms.findMainRoom(companyId);
      if (!main?.id) {
        throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '公司主群不存在' });
      }
      mainRoomId = main.id;
    }

    const mainRoom = await this.chatRooms.findOneOrFail(companyId, mainRoomId);
    if (mainRoom.roomType !== 'main') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'mainRoomId 须为主群' });
    }

    await this.assertActiveHumanRoomMember(companyId, mainRoomId, actor);

    const summary = String(data.summary ?? '').trim();
    if (!summary) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'summary 不能为空' });
    }

    const sourceRoomId = String(data.sourceRoomId ?? '').trim() || null;
    const content = `部门汇总·任务回报：${summary}`.slice(0, 4000);
    const richCard = {
      cardType: 'report_summary',
      taskId: task.id,
      title: task.title,
      status: task.status,
      progress: task.progress,
      summary: summary.slice(0, 2000),
      sourceRoomId,
      sourceThreadId: data.sourceThreadId?.trim() || null,
    };

    const msg = await this.chatMessages.appendSystemMessageAsActor(companyId, mainRoomId, actor.id, content, {
      source: 'task_report_to_main',
      taskId: task.id,
      richCard,
      messageCategory: 'report',
    });

    await this.publishTaskReportGenerated({
      task,
      roomId: mainRoomId,
      sourceRoomId,
      reportedByUserId: actor.id,
      escalationRequired: task.status === 'blocked',
      blockedReason: task.blockedReason ?? null,
      reportFlow: 'task_center_report_to_main',
    });

    if (sourceRoomId) {
      await this.publishTaskGovernanceSummary({
        companyId,
        roomId: sourceRoomId,
        audience: 'supervisor',
        items: [
          {
            taskId: task.id,
            status: task.status,
            progress: task.progress ?? null,
            blockedReason: task.blockedReason ?? null,
            reportFlow: 'task_center_report_to_main',
            visibilityScope: 'department',
          },
        ],
      });
    }
    if (task.status === 'blocked') {
      await this.publishTaskGovernanceSummary({
        companyId,
        roomId: mainRoomId,
        audience: 'ceo',
        items: [
          {
            taskId: task.id,
            status: task.status,
            progress: task.progress ?? null,
            blockedReason: task.blockedReason ?? null,
            reportFlow: 'task_center_report_to_main',
            visibilityScope: 'executive',
          },
        ],
      });
    }

    return { roomId: mainRoomId, messageId: msg.id };
  }

  /**
   * 跨部门协调请求：在主群发布 `coordination_request` 卡片。
   */
  async requestTaskCoordination(
    taskId: string,
    data: {
      mainRoomId?: string | null;
      targetDepartmentRoomId: string;
      request: string;
      neededBy?: string | null;
      sourceRoomId?: string | null;
      sourceMessageId?: string | null;
    },
    actor: Actor,
  ): Promise<{ roomId: string; messageId: string }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);

    const task = await this.tasksRepo.findOne({ where: { id: taskId, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }

    let mainRoomId = String(data.mainRoomId ?? '').trim();
    if (!mainRoomId) {
      const main = await this.chatRooms.findMainRoom(companyId);
      if (!main?.id) {
        throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '公司主群不存在' });
      }
      mainRoomId = main.id;
    }

    const mainRoom = await this.chatRooms.findOneOrFail(companyId, mainRoomId);
    if (mainRoom.roomType !== 'main') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'mainRoomId 须为主群' });
    }

    await this.assertActiveHumanRoomMember(companyId, mainRoomId, actor);

    const targetRoomId = String(data.targetDepartmentRoomId ?? '').trim();
    const targetRoom = await this.chatRooms.findOneOrFail(companyId, targetRoomId);
    if (targetRoom.roomType !== 'department') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'targetDepartmentRoomId 须为部门群',
      });
    }

    const requestText = String(data.request ?? '').trim();
    if (!requestText) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'request 不能为空' });
    }

    const sourceRoomId = String(data.sourceRoomId ?? '').trim() || null;
    const content =
      `【跨部门协调】任务「${task.title}」需要协助：${requestText}` +
      (data.neededBy?.trim() ? `\n期望时间：${String(data.neededBy).trim().slice(0, 200)}` : '');
    const richCard = {
      cardType: 'coordination_request',
      taskId: task.id,
      title: task.title,
      request: requestText.slice(0, 2000),
      targetDepartmentRoomId: targetRoomId,
      neededBy: data.neededBy?.trim() || null,
      sourceRoomId,
      sourceMessageId: data.sourceMessageId?.trim() || null,
    };

    const msg = await this.chatMessages.appendSystemMessageAsActor(
      companyId,
      mainRoomId,
      actor.id,
      content.slice(0, 4000),
      {
        source: 'task_coordination_request',
        taskId: task.id,
        richCard,
        messageCategory: 'coordination',
      },
    );

    await this.publishTaskEscalationRequested({
      task,
      roomId: mainRoomId,
      sourceRoomId,
      reportedByUserId: actor.id,
      escalationRequired: true,
      blockedReason: task.blockedReason ?? null,
      reportFlow: 'coordination_request',
      targetDepartmentRoomId: targetRoomId,
      request: requestText,
    });

    await this.publishTaskGovernanceSummary({
      companyId,
      roomId: mainRoomId,
      audience: 'ceo',
      items: [
        {
          taskId: task.id,
          status: task.status,
          progress: task.progress ?? null,
          blockedReason: task.blockedReason ?? requestText.slice(0, 400),
          reportFlow: 'coordination_request',
          visibilityScope: 'executive',
        },
      ],
    });

    return { roomId: mainRoomId, messageId: msg.id };
  }

  /** 编排监督确认：将主群 L2 子目标标记为 completed 并发布 `task.completed`。 */
  async completeMainRoomDistributionSubGoal(
    childTaskId: string,
    data: { parentGoalTaskId: string; reason?: string | null },
    actor: Actor,
  ): Promise<Record<string, unknown>> {
    const companyId = this.getCompanyIdOrThrow();
    if (!actor?.roles?.includes('admin')) {
      await this.assertAdmin(companyId, actor);
    }

    const childId = String(childTaskId ?? '').trim();
    const parentId = String(data.parentGoalTaskId ?? '').trim();
    if (!childId || !parentId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'childTaskId 与 parentGoalTaskId 不能为空',
      });
    }

    const child = await this.tasksRepo.findOne({ where: { id: childId, companyId } });
    if (!child) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '子目标任务不存在' });
    }
    if (String(child.parentId ?? '').trim() !== parentId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'parentGoalTaskId 与子任务 parentId 不一致',
      });
    }

    const delegationKey = String(child.metadata?.goalDelegationKey ?? '').trim();
    if (!delegationKey.startsWith('main_room_l2:')) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '仅主群编排 L2 子目标（goalDelegationKey 以 main_room_l2: 开头）可人工结案',
      });
    }

    const before = { ...child };
    if (child.status !== 'completed') {
      this.assertValidStatusTransition(child.status, 'completed');
      child.status = 'completed';
      child.progress = 100;
    }
    const reason = String(data.reason ?? '').trim();
    if (reason) {
      child.metadata = { ...(child.metadata ?? {}), mainRoomDistributionCompleteReason: reason.slice(0, 2000) };
    }
    const saved = await this.tasksRepo.save(child);
    await this.publishUpdated(before, saved);
    await this.publishProgress(saved);
    await this.publishCompleted(saved);
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

  private async assertWorkerOrAdminGoalActor(companyId: string, actor: Actor): Promise<void> {
    if (actor?.roles?.includes('admin')) return;
    await this.assertAdmin(companyId, actor);
  }

  private async isCompanyOwnerOrAdmin(companyId: string, actor: Actor): Promise<boolean> {
    if (!actor?.id) return false;
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true },
    });
    return !!membership && ['owner', 'admin'].includes(membership.role);
  }

  private async assertActiveHumanRoomMember(
    companyId: string,
    roomId: string,
    actor: Actor,
  ): Promise<void> {
    if (actor.roles?.includes('admin')) return;
    const ok = await this.roomMembers.isActiveMember(companyId, roomId, 'human', actor.id);
    if (!ok) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '非该协作群活跃成员，无法执行此操作',
      });
    }
  }

  private async publishTaskGovernanceSummary(params: {
    companyId: string;
    roomId: string;
    audience: 'supervisor' | 'director' | 'ceo';
    items: TaskGovernanceSummaryGeneratedEvent['data']['items'];
    sourceEventId?: string | null;
  }): Promise<void> {
    if (!params.roomId || !params.items.length) return;
    try {
      const event: TaskGovernanceSummaryGeneratedEvent = {
        eventId: randomUUID(),
        eventType: 'task.governance_summary.generated',
        aggregateId: params.items[0]!.taskId,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: params.companyId,
        data: {
          companyId: params.companyId,
          roomId: params.roomId,
          audience: params.audience,
          items: params.items,
          sourceEventId: params.sourceEventId ?? null,
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'task.governance_summary.generated',
        persistent: true,
      });
    } catch (e: unknown) {
      this.logger.warn('publish task.governance_summary.generated failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async publishTaskReportGenerated(params: {
    task: Task;
    roomId: string;
    sourceRoomId?: string | null;
    reportedByUserId: string;
    escalationRequired?: boolean;
    blockedReason?: string | null;
    reportFlow: string;
  }): Promise<void> {
    try {
      const event: TaskReportGeneratedEvent = {
        eventId: randomUUID(),
        eventType: 'task.report.generated',
        aggregateId: params.task.id,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: params.task.companyId,
        data: {
          taskId: params.task.id,
          companyId: params.task.companyId,
          parentTaskId: params.task.parentId ?? null,
          roomId: params.roomId,
          sourceRoomId: params.sourceRoomId ?? null,
          reportFlow: params.reportFlow,
          reportedByUserId: params.reportedByUserId,
          reportedAt: new Date().toISOString(),
          progress: params.task.progress,
          status: params.task.status as TaskDomainStatus,
          escalationRequired: params.escalationRequired === true,
          blockedReason: params.blockedReason ?? null,
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'task.report.generated',
        persistent: true,
      });
    } catch (e: unknown) {
      this.logger.warn('publish task.report.generated failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async publishTaskEscalationRequested(params: {
    task: Task;
    roomId: string;
    sourceRoomId?: string | null;
    reportedByUserId: string;
    escalationRequired?: boolean;
    blockedReason?: string | null;
    reportFlow: string;
    targetDepartmentRoomId?: string | null;
    request?: string | null;
  }): Promise<void> {
    try {
      const event: TaskEscalationRequestedEvent = {
        eventId: randomUUID(),
        eventType: 'task.escalation.requested',
        aggregateId: params.task.id,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: params.task.companyId,
        data: {
          taskId: params.task.id,
          companyId: params.task.companyId,
          parentTaskId: params.task.parentId ?? null,
          roomId: params.roomId,
          sourceRoomId: params.sourceRoomId ?? null,
          reportFlow: params.reportFlow,
          reportedByUserId: params.reportedByUserId,
          reportedAt: new Date().toISOString(),
          progress: params.task.progress,
          status: params.task.status as TaskDomainStatus,
          escalationRequired: params.escalationRequired === true,
          blockedReason: params.blockedReason ?? null,
          targetDepartmentRoomId: params.targetDepartmentRoomId ?? null,
          request: params.request ?? null,
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'task.escalation.requested',
        persistent: true,
      });
    } catch (e: unknown) {
      this.logger.warn('publish task.escalation.requested failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async assertActiveMemberUserId(companyId: string, userId: string): Promise<void> {
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId, isActive: true },
    });
    if (!membership) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'attributedUserId 须为公司活跃成员',
      });
    }
  }

  private async findGoalByIdempotencyKey(companyId: string, idempotencyKey: string): Promise<Task | null> {
    const key = String(idempotencyKey ?? '').trim();
    if (!key) return null;
    return this.tasksRepo
      .createQueryBuilder('t')
      .where('t.company_id = :companyId', { companyId })
      .andWhere(`t.metadata->>'idempotencyKey' = :idempotencyKey`, { idempotencyKey: key })
      .orderBy('t.created_at', 'DESC')
      .getOne();
  }

  private async findSubGoalByDelegationKey(
    companyId: string,
    parentId: string,
    goalDelegationKey: string,
  ): Promise<Task | null> {
    const key = String(goalDelegationKey ?? '').trim();
    if (!key) return null;
    return this.tasksRepo
      .createQueryBuilder('t')
      .where('t.company_id = :companyId', { companyId })
      .andWhere('t.parent_id = :parentId', { parentId })
      .andWhere(`t.metadata->>'goalDelegationKey' = :goalDelegationKey`, { goalDelegationKey: key })
      .getOne();
  }

  private async ensureMainGoalInternal(
    data: {
      roomId: string;
      sourceMessageId: string;
      title: string;
      description?: string | null;
      doneConditions?: string[];
      roundId?: string | null;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      idempotencyKey: string;
    },
    actor: Actor,
    attributedUserId: string | null,
  ): Promise<Record<string, unknown>> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertWorkerOrAdminGoalActor(companyId, actor);

    const idempotencyKey = String(data.idempotencyKey ?? '').trim();
    if (!idempotencyKey) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'idempotencyKey 不能为空' });
    }
    const roomId = String(data.roomId ?? '').trim();
    const sourceMessageId = String(data.sourceMessageId ?? '').trim();
    if (!roomId || !sourceMessageId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'roomId 与 sourceMessageId 不能为空',
      });
    }
    const existing = await this.findGoalByIdempotencyKey(companyId, idempotencyKey);
    if (existing) {
      const meta = (existing.metadata ?? {}) as Record<string, unknown>;
      const needsReconcile =
        String(meta.goalLevel ?? '') !== 'main' ||
        String(meta.sourceMessageId ?? '') !== sourceMessageId;
      if (needsReconcile) {
        existing.metadata = {
          ...meta,
          goalLevel: 'main',
          roomId,
          goalCoordinationRoomId: roomId,
          sourceMessageId,
          idempotencyKey,
        };
        await this.tasksRepo.save(existing);
      }
      return this.serializeTask(existing);
    }

    const done = (data.doneConditions ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);
    const title = String(data.title ?? '').trim().slice(0, 512) || '主目标';
    const description = String(data.description ?? '').trim() || null;
    const metadata: Record<string, unknown> = {
      goalLevel: 'main',
      roomId,
      goalCoordinationRoomId: roomId,
      sourceMessageId,
      idempotencyKey,
      ...(data.roundId?.trim() ? { roundId: data.roundId.trim() } : {}),
      ...(done.length ? { doneConditions: done.slice(0, 32) } : {}),
    };

    const task = this.tasksRepo.create({
      companyId,
      parentId: null,
      title,
      description,
      status: 'pending',
      priority: data.priority ?? 'normal',
      dueDate: null,
      expectedOutput: done.length ? done.join('；').slice(0, 4000) : description,
      progress: 0,
      assigneeType: 'unassigned',
      assigneeId: null,
      skillIds: null,
      requiresHumanApproval: false,
      metadata,
      createdByUserId: attributedUserId,
    });
    const saved = await this.tasksRepo.save(task);
    await this.publishCreated(saved, 'autonomous');
    return this.serializeTask(saved);
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

  private taskLifecycleEventFields(task: Task): {
    title: string;
    goalTargetRoomId?: string;
    assigneeId?: string | null;
    metadata?: Record<string, unknown>;
  } {
    const meta = (task.metadata ?? {}) as Record<string, unknown>;
    const goalTargetRoomId = String(meta.goalTargetRoomId ?? '').trim() || undefined;
    return {
      title: task.title,
      ...(goalTargetRoomId ? { goalTargetRoomId } : {}),
      assigneeId: task.assigneeId ?? null,
      ...(Object.keys(meta).length ? { metadata: meta } : {}),
    };
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
          ...this.taskLifecycleEventFields(task),
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
          ...this.taskLifecycleEventFields(task),
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
          status: task.status,
          progress: task.progress,
          ...this.taskLifecycleEventFields(task),
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
