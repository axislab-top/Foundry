import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { TaskBlockedEvent, TaskProgressUpdatedEvent } from '@contracts/events';
import { AlertsService } from '../alerts.service.js';

/**
 * 任务异常/停滞信号：将可疑状态落库为告警。
 */
@Injectable()
export class TaskAnomalyAlertListener implements OnModuleInit {
  private readonly logger = new Logger(TaskAnomalyAlertListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly alerts: AlertsService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskBlockedEvent>('task.blocked', (event) => {
      return this.alerts.createFromTaskBlockedEvent(event).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn('task blocked alert create failed', { message: msg });
      });
    }, {
      queue: 'api-alerts-task-blocked',
      durable: true,
      prefetchCount: 20,
    });

    this.messaging.subscribeWithBackoff<TaskProgressUpdatedEvent>('task.progress.updated', (event) => {
      return this.alerts.createFromTaskProgressEvent(event).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn('task progress alert create failed', { message: msg });
      });
    }, {
      queue: 'api-alerts-task-progress',
      durable: true,
      prefetchCount: 20,
    });
  }
}

