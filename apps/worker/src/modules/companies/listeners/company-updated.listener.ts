import { Injectable, OnModuleInit } from '@nestjs/common';
import { createLogger, LogLevel } from '@service/logging';
import { MessagingService } from '@service/messaging';
import type { CompanyUpdatedEvent } from '@contracts/events';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';

@Injectable()
export class CompanyUpdatedListener implements OnModuleInit {
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
    await this.messagingService.subscribe<CompanyUpdatedEvent>(
      'company.updated',
      this.handleCompanyUpdated.bind(this),
      {
        queue: 'company-updated-queue',
        durable: true,
      },
    );
  }

  private async handleCompanyUpdated(event: CompanyUpdatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event);
    if (companyId) {
      await this.tenantContext.runWithCompanyId(companyId, async () => {
        await this.process(event);
      });
      return;
    }
    await this.process(event);
  }

  private async process(event: CompanyUpdatedEvent): Promise<void> {
    const ok = this.idempotency.markIfNew(`company.updated:${event.eventId}`, 24 * 60 * 60_000);
    if (!ok) return;
    this.logger.info('Processed company.updated (logical)', {
      eventId: event.eventId,
      companyId: event.data.companyId,
      changes: Object.keys(event.data.changes || {}),
    });
  }
}
