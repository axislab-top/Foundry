import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { TaskCompletedEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';

@Injectable()
export class MainRoomDistributionTaskCompletionListener implements OnModuleInit {
  private readonly logger = new Logger(MainRoomDistributionTaskCompletionListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskCompletedEvent>(
      'task.completed',
      this.handle.bind(this),
      {
        queue: 'worker-main-room-distribution-task-completed',
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handle(event: TaskCompletedEvent): Promise<void> {
    if (!this.config.isMainRoomDispatchRespectDependencies() && !this.config.isMainRoomDistributionCompletionSummaryEnabled()) {
      return;
    }
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    const taskId = event.data?.taskId;
    const parentId = event.data?.parentId ?? null;
    if (!companyId || !taskId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        // NOTE: MainRoomDistributionDispatchExecutorService has been removed.
        // Task completion dispatch is temporarily disabled.
        this.logger.debug('main_room.dist_task_completed.skipped_service_removed', {
          companyId,
          taskId,
          parentId,
        });
      } catch (e: unknown) {
        this.logger.warn('main_room.dist_task_completed.handler_failed', {
          companyId,
          taskId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
