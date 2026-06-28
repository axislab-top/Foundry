import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { BaseEvent, TaskCompletedEvent, TaskCreatedEvent, TaskProgressUpdatedEvent } from '@contracts/events';
import { ChatMessageService } from '../services/chat-message.service.js';
import { ConfigService } from '../../../common/config/config.service.js';

type DepartmentTaskLifecycleEvent =
  | TaskCreatedEvent
  | TaskProgressUpdatedEvent
  | TaskCompletedEvent
  | (BaseEvent & { data?: Record<string, unknown> });

@Injectable()
export class DepartmentTaskStageMessageListener implements OnModuleInit {
  private readonly logger = new Logger(DepartmentTaskStageMessageListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly messages: ChatMessageService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<DepartmentTaskLifecycleEvent>('task.created', this.handle.bind(this), {
      queue: 'api-collab-department-task-stage-created',
      durable: true,
      prefetchCount: 50,
    });
    this.messaging.subscribeWithBackoff<DepartmentTaskLifecycleEvent>('task.progress.updated', this.handle.bind(this), {
      queue: 'api-collab-department-task-stage-progress',
      durable: true,
      prefetchCount: 50,
    });
    this.messaging.subscribeWithBackoff<DepartmentTaskLifecycleEvent>('task.completed', this.handle.bind(this), {
      queue: 'api-collab-department-task-stage-completed',
      durable: true,
      prefetchCount: 50,
    });
  }

  private workerActorUserId(): string {
    return (
      process.env.WORKER_ACTOR_USER_ID?.trim() ||
      process.env.FOUNDRY_WORKER_ACTOR_USER_ID?.trim() ||
      '00000000-0000-0000-0000-000000000000'
    );
  }

  private getRoomId(event: DepartmentTaskLifecycleEvent): string {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const meta = data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : undefined;
    return String(
      data.goalTargetRoomId ?? data.roomId ?? meta?.goalTargetRoomId ?? meta?.roomId ?? '',
    ).trim();
  }

  private getStageLabel(event: DepartmentTaskLifecycleEvent): string {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const meta = data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : undefined;
    const planned = meta?.plannedDistribution && typeof meta.plannedDistribution === 'object' && !Array.isArray(meta.plannedDistribution)
      ? (meta.plannedDistribution as Record<string, unknown>)
      : undefined;
    const profile = String(planned?.executionProfile ?? meta?.executionProfile ?? '').trim();
    if (profile === 'director_delegates') return '方案拆解';
    if (profile === 'employee') return '执行推进';
    if (profile === 'solo_director') return '复盘验收';
    return '部门任务';
  }

  private buildRichCard(event: DepartmentTaskLifecycleEvent): Record<string, unknown> | null {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const taskId = String(data.taskId ?? '').trim();
    if (!taskId) return null;
    const meta = data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : undefined;
    const planned = meta?.plannedDistribution && typeof meta.plannedDistribution === 'object' && !Array.isArray(meta.plannedDistribution)
      ? (meta.plannedDistribution as Record<string, unknown>)
      : undefined;
    const stage = this.getStageLabel(event);
    const title = String(data.title ?? '').trim() || taskId;
    const status = String(data.status ?? '').trim() || 'unknown';
    const progress = typeof data.progress === 'number' ? data.progress : null;

    const dependencies = Array.isArray(meta?.distributionDependsOnTaskIds)
      ? meta.distributionDependsOnTaskIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];

    return {
      cardType: 'task_stage',
      title,
      stage,
      status,
      progress,
      taskId,
      parentTaskId: String(planned?.parentTaskId ?? meta?.goalParentTaskId ?? data.parentId ?? '').trim() || undefined,
      planTaskId: String(planned?.distributionPlanTaskId ?? meta?.distributionPlanTaskId ?? '').trim() || undefined,
      executionProfile: String(planned?.executionProfile ?? meta?.executionProfile ?? '').trim() || undefined,
      dependencies: dependencies.length ? dependencies.slice(0, 16) : undefined,
      assigneeId: String(data.assigneeId ?? meta?.directorAgentId ?? '').trim() || undefined,
      summary: event.eventType === 'task.completed'
        ? `任务「${title}」已完成，进入下一阶段。`
        : event.eventType === 'task.progress.updated'
          ? `任务「${title}」进度更新至 ${progress == null ? '未知' : `${progress}%`}。`
          : `任务「${title}」已创建并进入${stage}阶段。`,
    };
  }

  private formatContent(event: DepartmentTaskLifecycleEvent): string | null {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const taskId = String(data.taskId ?? '').trim();
    if (!taskId) return null;
    const title = String(data.title ?? '').trim();
    const status = String(data.status ?? '').trim() || 'unknown';
    const progress = typeof data.progress === 'number' ? `${data.progress}%` : null;
    const stage = this.getStageLabel(event);

    if (event.eventType === 'task.created') {
      const progressSuffix = progress ? ` 当前进度：${progress}。` : '';
      return `【${stage}已创建】任务「${title || taskId}」已进入部门流程。${progressSuffix}`;
    }
    if (event.eventType === 'task.progress.updated') {
      const progressSuffix = progress ? ` 进度：${progress}。` : '';
      return `【${stage}进度更新】任务「${title || taskId}」状态：${status}。${progressSuffix}`;
    }
    if (event.eventType === 'task.completed') {
      return `【${stage}已完成】任务「${title || taskId}」已完成，可进入下一阶段。`;
    }
    return null;
  }

  /** 仅 L2 部门子目标 / 主管层任务镜像到部门群，避免员工子任务刷屏。 */
  private shouldAnnounceInDepartmentChat(event: DepartmentTaskLifecycleEvent): boolean {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const meta = data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : undefined;
    const planned = meta?.plannedDistribution && typeof meta.plannedDistribution === 'object' && !Array.isArray(meta.plannedDistribution)
      ? (meta.plannedDistribution as Record<string, unknown>)
      : undefined;
    const goalLevel = String(meta?.goalLevel ?? data.goalLevel ?? '').trim();
    if (goalLevel === 'sub') return true;
    const profile = String(planned?.executionProfile ?? meta?.executionProfile ?? '').trim();
    return profile === 'director_delegates' || profile === 'solo_director';
  }

  private async handle(event: DepartmentTaskLifecycleEvent): Promise<void> {
    if (!this.config.isCollabDeptTaskStageChatEnabled()) return;

    const companyId = resolveCompanyIdFromEvent(event) || event.companyId;
    const roomId = this.getRoomId(event);
    const content = this.formatContent(event);
    const richCard = this.buildRichCard(event);
    if (!companyId || !roomId || !content) return;
    if (!this.shouldAnnounceInDepartmentChat(event)) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.messages.appendSystemMessageAsActor(companyId, roomId, this.workerActorUserId(), content.slice(0, 4000), {
          source: 'department_task_stage_message',
          sourceEventId: event.eventId,
          eventType: event.eventType,
          ...(richCard ? { richCard, taskId: richCard.taskId } : {}),
        });
      } catch (e: unknown) {
        this.logger.warn('department_task_stage_message.append_failed', {
          companyId,
          roomId,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
