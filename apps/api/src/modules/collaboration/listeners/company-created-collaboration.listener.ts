import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CompanyCreatedEvent } from '@contracts/events';
import { AgentsBootstrapService } from '../../agents/services/agents-bootstrap.service.js';
import { CollaborationBootstrapService } from '../services/collaboration-bootstrap.service.js';

/**
 * 公司创建后初始化主协作群（幂等）。
 */
@Injectable()
export class CompanyCreatedCollaborationListener implements OnModuleInit {
  private readonly logger = new Logger(CompanyCreatedCollaborationListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly agentsBootstrap: AgentsBootstrapService,
    private readonly collaborationBootstrap: CollaborationBootstrapService,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<CompanyCreatedEvent>(
      'company.created',
      this.handle.bind(this),
      {
        queue: 'collaboration-company-created-queue',
        durable: true,
        prefetchCount: 3,
      },
    );
  }

  private async handle(event: CompanyCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.agentsBootstrap.ensureDefaultAgentsForCompany(companyId);
        await this.agentsBootstrap.atomicInitializeCeoLayers(companyId, 'bestEffort');
        await this.collaborationBootstrap.ensureMainRoomConvergedForCompany(
          companyId,
          event.data.createdBy,
          event.data.name,
        );
      } catch (err: any) {
        this.logger.error('Collaboration critical bootstrap failed; will retry by MQ', {
          companyId,
          eventId: event.eventId,
          error: err?.message,
        });
        throw err;
      }
      try {
        await this.collaborationBootstrap.ensureDepartmentRoomsForCompany(
          companyId,
          event.data.createdBy,
        );
        this.logger.log('Collaboration main room after company.created', {
          companyId,
          eventId: event.eventId,
        });
      } catch (err: any) {
        this.logger.warn('Collaboration non-critical bootstrap skipped or failed', {
          companyId,
          eventId: event.eventId,
          error: err?.message,
        });
      }
    });
  }
}
