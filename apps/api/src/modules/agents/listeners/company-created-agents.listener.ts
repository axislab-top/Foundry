import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CompanyCreatedEvent } from '@contracts/events';
import { AgentsBootstrapService } from '../services/agents-bootstrap.service.js';

/**
 * 幂等兜底：公司创建后若组织已由其他实例初始化，可在此补建默认 Agent。
 */
@Injectable()
export class CompanyCreatedAgentsListener implements OnModuleInit {
  private readonly logger = new Logger(CompanyCreatedAgentsListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly agentsBootstrap: AgentsBootstrapService,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<CompanyCreatedEvent>(
      'company.created',
      this.handle.bind(this),
      {
        queue: 'agents-company-created-queue',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(event: CompanyCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) {
      return;
    }
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.agentsBootstrap.ensureDefaultAgentsForCompany(companyId);
        await this.agentsBootstrap.atomicInitializeCeoLayers(companyId, 'bestEffort');
        this.logger.log('Agents bootstrap after company.created', {
          companyId,
          eventId: event.eventId,
        });
      } catch (err: any) {
        this.logger.warn('Agents bootstrap skipped or failed', {
          companyId,
          error: err?.message,
        });
      }
    });
  }
}
