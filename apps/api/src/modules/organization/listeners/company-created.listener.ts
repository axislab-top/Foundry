import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CompanyCreatedEvent } from '@contracts/events';
import { OrganizationInitializerService } from '../services/organization-initializer.service.js';

@Injectable()
export class OrganizationCompanyCreatedListener implements OnModuleInit {
  private readonly logger = new Logger(OrganizationCompanyCreatedListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly initializer: OrganizationInitializerService,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<CompanyCreatedEvent>(
      'company.created',
      this.handleCompanyCreated.bind(this),
      {
        queue: 'organization-company-created-queue',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handleCompanyCreated(event: CompanyCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) {
      return;
    }

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      await this.initializer.initializeForCompany(
        companyId,
        event.data.industry,
        event.data.industryCode,
      );
    });

    this.logger.log('Initialized organization for company.created', {
      companyId,
      eventId: event.eventId,
    });
  }
}
