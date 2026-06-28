import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CompanyCreatedEvent } from '@contracts/events';
import { OrganizationInitializerService } from '../services/organization-initializer.service.js';
import { QueryFailedError } from 'typeorm';

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

    try {
      await this.tenantContext.runWithCompanyId(companyId, async () => {
        const alreadyInitialized = await this.initializer.hasExistingOrganizationStructure(companyId);
        if (alreadyInitialized) {
          this.logger.log('Skip organization init for company.created — structure already present', {
            companyId,
            eventId: event.eventId,
          });
          return;
        }
        await this.initializer.initializeForCompany(
          companyId,
          event.data.industry,
          event.data.industryCode,
        );
      });
    } catch (error: any) {
      if (this.isOrganizationNodeCompanyFkViolation(error)) {
        // Temporary drain guard: consume the event and avoid endless retries on orphan companyId.
        this.logger.warn('Skip organization init for company.created due to FK mismatch', {
          companyId,
          eventId: event.eventId,
          error: error?.message,
        });
        return;
      }
      throw error;
    }

    this.logger.log('Initialized organization for company.created', {
      companyId,
      eventId: event.eventId,
    });
  }

  private isOrganizationNodeCompanyFkViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = (error as any).driverError;
    return (
      driverError?.code === '23503' &&
      driverError?.constraint === 'organization_nodes_company_id_fkey'
    );
  }
}
