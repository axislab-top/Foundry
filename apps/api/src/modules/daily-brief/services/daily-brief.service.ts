import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type {
  DailyBriefPendingKind,
  DailyBriefPriority,
  DailyBriefResponse,
} from '@contracts/types';
import {
  SQL_SET_LOCAL_CURRENT_TENANT,
  SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER,
  TenantContextService,
} from '@service/tenant';
import { isAuthorized } from '../../../common/authz/authorization.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { ApprovalService } from '../../approval/services/approval.service.js';
import type { ApprovalRequest } from '../../approval/entities/approval-request.entity.js';
import { ChatRoomService } from '../../collaboration/services/chat-room.service.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { Company } from '../../companies/entities/company.entity.js';
import { Task, type TaskPriority, type TaskStatus } from '../../tasks/entities/task.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { DailyBriefMetricsService } from './daily-brief-metrics.service.js';
import { DailyBriefSummaryService } from './daily-brief-summary.service.js';
import {
  getCompanyLocalDateString,
  normalizeCompanyTimezone,
} from '../utils/daily-brief-time.util.js';

const PENDING_TASK_STATUSES: TaskStatus[] = [
  'awaiting_approval',
  'blocked',
  'review',
  'pending',
  'in_progress',
];

const PRIORITY_ORDER: Record<DailyBriefPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const TASK_PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

interface Actor {
  id: string;
  roles?: string[];
  username?: string;
}

type PendingItem = DailyBriefResponse['pendingItems'][number];

@Injectable()
export class DailyBriefService {
  constructor(
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    @InjectRepository(Task) private readonly tasksRepo: Repository<Task>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly tenantContext: TenantContextService,
    private readonly approvalService: ApprovalService,
    private readonly chatRoomService: ChatRoomService,
    private readonly metricsService: DailyBriefMetricsService,
    private readonly summaryService: DailyBriefSummaryService,
  ) {}

  async getForUser(actor: Actor): Promise<DailyBriefResponse> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);

    const company = await this.companiesRepo.findOne({
      where: { id: companyId },
      select: ['id', 'timezone'],
    });
    const timezone = normalizeCompanyTimezone(company?.timezone);
    const briefDate = getCompanyLocalDateString(timezone, 0);

    const [displayName, metrics, pendingItems] = await Promise.all([
      this.resolveDisplayName(actor),
      this.metricsService.computeYesterdayMetrics(companyId, actor.id, timezone),
      this.buildPendingItems(companyId, actor),
    ]);

    const yesterdaySummary = await this.summaryService.resolveYesterdaySummary(
      companyId,
      timezone,
      metrics,
    );

    return {
      companyId,
      user: { displayName },
      timezone,
      briefDate,
      yesterdaySummary,
      pendingItems,
      keyMetrics: {
        tasksExecutedYesterday: metrics.tasksExecutedYesterday,
        successRatePercent: metrics.successRatePercent,
        approvalsHandledYesterday: metrics.approvalsHandledYesterday,
        estimatedTimeSavedHours: metrics.estimatedTimeSavedHours,
      },
      generatedAt: new Date().toISOString(),
    };
  }

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

  private async assertMember(companyId: string, actor: Actor): Promise<CompanyMembership> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '需要登录',
      });
    }
    if (this.isAdminActor(actor)) {
      return { companyId, userId: actor.id, role: 'owner', isActive: true } as CompanyMembership;
    }

    const membership = await this.membershipsRepo.manager.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [actor.id]);
      return manager.getRepository(CompanyMembership).findOne({
        where: { companyId, userId: actor.id, isActive: true },
      });
    });

    if (!membership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '无权访问该公司快报',
      });
    }
    return membership;
  }

  private async resolveDisplayName(actor: Actor): Promise<string> {
    if (actor.username?.trim()) return actor.username.trim();
    const user = await this.usersRepo.findOne({
      where: { id: actor.id },
      select: ['username'],
    });
    return user?.username?.trim() || '用户';
  }

  private async isCompanyApprover(
    companyId: string,
    actor: Actor,
    membership: CompanyMembership | null,
  ): Promise<boolean> {
    if (isAuthorized(actor, { anyRoles: ['admin', 'owner'] })) return true;
    if (membership && ['owner', 'admin'].includes(membership.role)) return true;
    if (!membership) {
      const row = await this.membershipsRepo.findOne({
        where: { companyId, userId: actor.id, isActive: true },
        select: ['role'],
      });
      return Boolean(row && ['owner', 'admin'].includes(row.role));
    }
    return false;
  }

  private async buildPendingItems(companyId: string, actor: Actor): Promise<PendingItem[]> {
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true },
      select: ['role'],
    });
    const isApprover = await this.isCompanyApprover(companyId, actor, membership);

    const [approvals, tasks, rooms] = await Promise.all([
      isApprover ? this.approvalService.listPending(companyId, 5) : Promise.resolve([]),
      this.tasksRepo.find({
        where: { companyId, status: In(PENDING_TASK_STATUSES) },
        order: { priority: 'ASC', dueDate: 'ASC', updatedAt: 'DESC' },
        take: 20,
        select: ['id', 'title', 'status', 'priority', 'dueDate'],
      }),
      this.chatRoomService.listRoomsWithUnread(companyId, actor.id),
    ]);

    const approvalItems = approvals.slice(0, 5).map((a) => mapApprovalItem(a));
    const taskItems = tasks
      .sort((a, b) => TASK_PRIORITY_ORDER[a.priority] - TASK_PRIORITY_ORDER[b.priority])
      .slice(0, 5)
      .map((t) => mapTaskItem(t));
    const messageItems = rooms
      .filter((r) => r.unreadCount > 0)
      .sort((a, b) => b.unreadCount - a.unreadCount)
      .slice(0, 5)
      .map((r) => mapMessageItem(r.id, r.name, r.unreadCount));

    return sortPendingItems([...approvalItems, ...taskItems, ...messageItems]);
  }
}

function sortPendingItems(items: PendingItem[]): PendingItem[] {
  return [...items].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );
}

function mapApprovalItem(req: ApprovalRequest): PendingItem {
  return {
    id: req.id,
    kind: 'approval',
    title: extractApprovalTitle(req),
    tag: formatApprovalTag(req.actionType),
    priority: mapRiskToPriority(req.riskLevel),
    href: '/collaboration/pending-approvals',
  };
}

function mapTaskItem(task: Task): PendingItem {
  return {
    id: task.id,
    kind: 'task',
    title: task.title?.trim() || '未命名任务',
    tag: formatTaskStatusTag(task.status),
    priority: mapTaskPriority(task.priority),
    href: `/tasks/center?selectedId=${task.id}`,
  };
}

function mapMessageItem(roomId: string, name: string, unreadCount: number): PendingItem {
  return {
    id: roomId,
    kind: 'message',
    title: name?.trim() || '群聊',
    tag: unreadCount > 1 ? `${unreadCount} 条未读` : '未读消息',
    priority: unreadCount >= 5 ? 'high' : unreadCount >= 2 ? 'medium' : 'low',
    href: `/collaboration/chats?roomId=${roomId}`,
  };
}

function extractApprovalTitle(req: ApprovalRequest): string {
  const ctx = req.context;
  if (ctx && typeof ctx === 'object') {
    const rec = ctx as Record<string, unknown>;
    if (typeof rec.title === 'string' && rec.title.trim()) return rec.title.trim();
    if (typeof rec.reason === 'string' && rec.reason.trim()) return rec.reason.trim();
    if (typeof rec.summary === 'string' && rec.summary.trim()) return rec.summary.trim();
  }
  return req.actionType || '待审批事项';
}

function formatApprovalTag(actionType: string): string {
  const root = actionType?.split('.')[0] ?? actionType;
  const labels: Record<string, string> = {
    skill: '技能审批',
    agent: 'Agent 审批',
    budget: '预算审批',
    config: '配置审批',
    hire: '招聘审批',
  };
  return labels[root] ?? '审批';
}

function formatTaskStatusTag(status: TaskStatus): string {
  const labels: Record<string, string> = {
    awaiting_approval: '待审批',
    blocked: '已阻塞',
    review: '待审核',
    pending: '待处理',
    in_progress: '进行中',
  };
  return labels[status] ?? '任务';
}

function mapRiskToPriority(riskLevel: string): DailyBriefPriority {
  if (riskLevel === 'L3') return 'high';
  if (riskLevel === 'L2') return 'medium';
  return 'low';
}

function mapTaskPriority(priority: TaskPriority): DailyBriefPriority {
  if (priority === 'urgent' || priority === 'high') return 'high';
  if (priority === 'normal') return 'medium';
  return 'low';
}
