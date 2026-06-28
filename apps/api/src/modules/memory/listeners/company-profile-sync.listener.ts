import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type {
  CompanyCreatedEvent,
  CompanyUpdatedEvent,
  OrganizationNodeCreatedEvent,
  OrganizationNodeDeletedEvent,
  OrganizationNodeMovedEvent,
  OrganizationNodeUpdatedEvent,
  OrganizationStructureChangedEvent,
} from '@contracts/events';
import { CompanyProfileService } from '../services/company-profile.service.js';

/** 公司档案写入 Memory：公司信息变更 + 组织架构变更时触发同步 */
@Injectable()
export class CompanyProfileSyncListener implements OnModuleInit {
  private readonly logger = new Logger(CompanyProfileSyncListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly profiles: CompanyProfileService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CompanyCreatedEvent>(
      'company.created',
      (e) => this.handleCompanyEvent(e, 'event:company.created'),
      {
        queue: 'api-company-profile-sync-created',
        durable: true,
        prefetchCount: 10,
      },
    );
    this.messaging.subscribeWithBackoff<CompanyUpdatedEvent>(
      'company.updated',
      (e) => this.handleCompanyEvent(e, 'event:company.updated'),
      {
        queue: 'api-company-profile-sync-updated',
        durable: true,
        prefetchCount: 10,
      },
    );

    const orgOpts = {
      durable: true as const,
      prefetchCount: 10,
    };
    this.messaging.subscribeWithBackoff<OrganizationNodeCreatedEvent>(
      'organization.node.created',
      (e) => this.handleOrgEvent(e, 'event:organization.node.created'),
      { queue: 'api-company-profile-sync-org-created', ...orgOpts },
    );
    this.messaging.subscribeWithBackoff<OrganizationNodeUpdatedEvent>(
      'organization.node.updated',
      (e) => this.handleOrgEvent(e, 'event:organization.node.updated'),
      { queue: 'api-company-profile-sync-org-updated', ...orgOpts },
    );
    this.messaging.subscribeWithBackoff<OrganizationNodeDeletedEvent>(
      'organization.node.deleted',
      (e) => this.handleOrgEvent(e, 'event:organization.node.deleted'),
      { queue: 'api-company-profile-sync-org-deleted', ...orgOpts },
    );
    this.messaging.subscribeWithBackoff<OrganizationNodeMovedEvent>(
      'organization.node.moved',
      (e) => this.handleOrgEvent(e, 'event:organization.node.moved'),
      { queue: 'api-company-profile-sync-org-moved', ...orgOpts },
    );
    this.messaging.subscribeWithBackoff<OrganizationStructureChangedEvent>(
      'organization.structure.changed',
      (e) => this.handleOrgEvent(e, 'event:organization.structure.changed'),
      { queue: 'api-company-profile-sync-org-structure', ...orgOpts },
    );
  }

  private async handleCompanyEvent(
    event: CompanyCreatedEvent | CompanyUpdatedEvent,
    trigger: string,
  ): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data?.companyId;
    if (!companyId) return;
    await this.sync(companyId, trigger);
  }

  private async handleOrgEvent(
    event:
      | OrganizationNodeCreatedEvent
      | OrganizationNodeUpdatedEvent
      | OrganizationNodeDeletedEvent
      | OrganizationNodeMovedEvent
      | OrganizationStructureChangedEvent,
    trigger: string,
  ): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data?.companyId;
    if (!companyId) return;
    await this.sync(companyId, trigger);
  }

  private async sync(companyId: string, trigger: string): Promise<void> {
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.profiles.syncCompanyProfile({ companyId, trigger });
      } catch (e: any) {
        this.logger.warn('company profile sync failed', {
          companyId,
          trigger,
          message: e?.message,
        });
      }
    });
  }
}
