import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';
import type { BaseEvent } from '@contracts/events';

@Injectable()
export class CompensationListener implements OnModuleInit {
  private readonly logger = new Logger(CompensationListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly monitoring: MonitoringService,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<BaseEvent & { data?: Record<string, unknown> }>(
      'compensation.requested',
      async (event) => {
        this.monitoring.incCompensationRequested(1);
        const data = event?.data ?? {};
        this.logger.warn('Compensation requested (skeleton handler)', {
          traceId: String((data as any).traceId ?? ''),
          action: String((data as any).action ?? ''),
          reason: String((data as any).reason ?? ''),
        });
      },
      {
        queue: 'worker-compensation-listener-queue',
        durable: true,
        prefetchCount: 20,
      },
    );
  }
}
