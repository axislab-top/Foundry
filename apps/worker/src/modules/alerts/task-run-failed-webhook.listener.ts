import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { TaskRunFailedEvent } from '@contracts/events';
import { AlertWebhookService } from './alert-webhook.service.js';

@Injectable()
export class TaskRunFailedWebhookListener implements OnModuleInit {
  private readonly logger = new Logger(TaskRunFailedWebhookListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly alerts: AlertWebhookService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskRunFailedEvent>(
      'task.run.failed',
      this.handle.bind(this),
      {
        queue: 'worker-task-run-failed-alerts',
        durable: true,
        prefetchCount: 5,
        retry: {
          enabled: true,
          maxAttempts: 5,
          initialDelayMs: 1000,
          backoffFactor: 2,
          maxDelayMs: 60_000,
        },
      },
    );
  }

  private async handle(event: TaskRunFailedEvent): Promise<void> {
    if (event.eventType !== 'task.run.failed') {
      return;
    }
    try {
      await this.alerts.notifyTaskRunFailed(event);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn('notifyTaskRunFailed failed', { message });
    }
  }
}
