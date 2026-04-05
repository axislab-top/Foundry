import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { TaskCompletedEvent } from '@contracts/events';
import { MemoryService } from '../services/memory.service.js';
import { companyNamespace } from '../utils/memory-namespace.js';

/**
 * 任务完成时写入公司级记忆，供后续 Agent 检索与复盘。
 */
@Injectable()
export class TaskCompletedMemoryListener implements OnModuleInit {
  private readonly logger = new Logger(TaskCompletedMemoryListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly memory: MemoryService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskCompletedEvent>(
      'task.completed',
      this.handle.bind(this),
      {
        queue: 'api-task-completed-memory',
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handle(event: TaskCompletedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    if (!companyId || !event.data?.taskId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const content = `任务已完成 taskId=${event.data.taskId}，完成时间 ${event.data.completedAt}。`;
      try {
        await this.memory.storeEntry({
          companyId,
          namespace: companyNamespace(),
          collectionLabel: 'Task completions',
          content,
          sourceType: 'task',
          sourceRef: event.data.taskId,
          metadata: {
            parentId: event.data.parentId,
            eventId: event.eventId,
          },
          skipAccessCheck: true,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('task completion memory store failed', { message });
      }
    });
  }
}
