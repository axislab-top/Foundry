import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CollaborationTaskExtractedEvent } from '@contracts/events';
import { TasksService } from '../services/tasks.service.js';
import { ChatMessageService } from '../../collaboration/services/chat-message.service.js';

/**
 * 群聊抽取的任务候选落地为正式 Task，与 Memory 侧「任务记忆」并行。
 */
@Injectable()
export class CollaborationTaskExtractedTasksListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationTaskExtractedTasksListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly tasksService: TasksService,
    private readonly chatMessages: ChatMessageService,
  ) {}

  private workerActorUserId(): string {
    return (
      process.env.WORKER_ACTOR_USER_ID?.trim() ||
      process.env.FOUNDRY_WORKER_ACTOR_USER_ID?.trim() ||
      '00000000-0000-0000-0000-000000000000'
    );
  }

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CollaborationTaskExtractedEvent>(
      'collaboration.task.extracted',
      this.handle.bind(this),
      {
        queue: 'api-collab-task-entity',
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handle(event: CollaborationTaskExtractedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.companyId;
    if (!companyId) return;

    const title = event.data.title?.trim();
    if (!title) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        const task = await this.tasksService.createFromEvent(
          {
            title,
            description: event.data.description?.trim(),
            metadata: {
              source: 'collaboration_extract',
              roomId: event.data.roomId,
              sourceMessageId: event.data.sourceMessageId,
              extractedAt: event.data.extractedAt,
            },
          },
          companyId,
        );
        const roomId = String(event.data.roomId ?? '').trim();
        if (roomId) {
          await this.chatMessages.appendSystemMessageAsActor(
            companyId,
            roomId,
            this.workerActorUserId(),
            `【任务已记录】已从聊天识别待办并写入任务中心（可在侧栏或任务中心查看）。任务：${title.slice(0, 200)}`,
            {
              source: 'collaboration_task_extracted',
              taskId: task.id,
              directReplyToMessageId: event.data.sourceMessageId,
            },
          );
        }
      } catch (e: any) {
        this.logger.warn('create task from collaboration extract failed', {
          message: e?.message,
        });
      }
    });
  }
}
