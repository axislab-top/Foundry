import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CollaborationTaskExtractedEvent } from '@contracts/events';
import { TasksService } from '../services/tasks.service.js';

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
  ) {}

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
        await this.tasksService.createFromEvent(
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
      } catch (e: any) {
        this.logger.warn('create task from collaboration extract failed', {
          message: e?.message,
        });
      }
    });
  }
}
