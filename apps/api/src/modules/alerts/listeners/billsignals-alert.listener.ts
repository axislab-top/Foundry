import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { BudgetExceededEvent, BudgetWarningEvent } from '@contracts/events';
import { AlertsService } from '../alerts.service.js';

/**
 * 预算预警/超额：将计费信号落库为可处理告警。
 */
@Injectable()
export class BudgetSignalsAlertListener implements OnModuleInit {
  private readonly logger = new Logger(BudgetSignalsAlertListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly alerts: AlertsService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<BudgetWarningEvent>(
      'budget.warning',
      async (event) => this.alerts.createFromBudgetEvent(event),
      {
        queue: 'api-alerts-budget-warning',
        durable: true,
        prefetchCount: 10,
      },
    );

    this.messaging.subscribeWithBackoff<BudgetExceededEvent>(
      'budget.exceeded',
      async (event) => this.alerts.createFromBudgetEvent(event),
      {
        queue: 'api-alerts-budget-exceeded',
        durable: true,
        prefetchCount: 10,
      },
    );
  }
}

