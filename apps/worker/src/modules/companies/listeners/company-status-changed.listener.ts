import { Injectable, OnModuleInit } from '@nestjs/common';
import { createLogger, LogLevel } from '@service/logging';
import { MessagingService } from '@service/messaging';
import type { CompanyStatusChangedEvent } from '@contracts/events';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';

@Injectable()
export class CompanyStatusChangedListener implements OnModuleInit {
  private readonly logger = createLogger({
    service: 'worker-service',
    level: LogLevel.INFO,
  });

  constructor(
    private readonly messagingService: MessagingService,
    private readonly idempotency: IdempotencyService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async onModuleInit() {
    await this.messagingService.subscribe<CompanyStatusChangedEvent>(
      'company.status_changed',
      this.handleStatusChanged.bind(this),
      {
        queue: 'company-status-changed-queue',
        durable: true,
      },
    );
  }

  private async handleStatusChanged(event: CompanyStatusChangedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event);
    if (companyId) {
      await this.tenantContext.runWithCompanyId(companyId, async () => {
        await this.process(event);
      });
      return;
    }
    await this.process(event);
  }

  private async process(event: CompanyStatusChangedEvent): Promise<void> {
    const ok = this.idempotency.markIfNew(
      `company.status_changed:${event.eventId}`,
      24 * 60 * 60_000,
    );
    if (!ok) return;
    this.logger.info('Processed company.status_changed (logical)', {
      eventId: event.eventId,
      companyId: event.data.companyId,
      fromStatus: event.data.fromStatus,
      toStatus: event.data.toStatus,
    });
  }
}
