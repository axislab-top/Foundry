import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { BillingConsumptionRequestedEvent, TaskCompletedEvent } from '@contracts/events';

/**
 * 任务完成 → 异步入账一条带 task_id 的消耗（名义 LLM Token，便于按任务维度汇总）。
 * 由 {@link BillingConsumptionRequestedListener} 统一 RPC 写入 billing_records。
 */
@Injectable()
export class TaskCompletedBillingListener implements OnModuleInit {
  private readonly logger = new Logger(TaskCompletedBillingListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskCompletedEvent>(
      'task.completed',
      this.handle.bind(this),
      {
        queue: 'worker-task-completed-billing',
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handle(event: TaskCompletedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    const taskId = event.data?.taskId;
    if (!companyId || !taskId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const idempotencyKey = `task-done:${taskId}:${event.data.completedAt}`;
      const ev: BillingConsumptionRequestedEvent = {
        eventId: randomUUID(),
        eventType: 'billing.consumption.requested',
        aggregateId: taskId,
        aggregateType: 'billing',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          companyId,
          recordType: 'llm',
          taskId,
          modelName: 'gpt-4o-mini',
          inputTokens: 20,
          outputTokens: 20,
          idempotencyKey,
          metadata: { source: 'task.completed' },
        },
      };
      const ok = await this.messaging.publish(ev, {
        routingKey: 'billing.consumption.requested',
        persistent: true,
      });
      if (!ok) {
        this.logger.warn('billing.consumption.requested publish skipped (MQ)', {
          companyId,
          taskId,
        });
      }
    });
  }
}
