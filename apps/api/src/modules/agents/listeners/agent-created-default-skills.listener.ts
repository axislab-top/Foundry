import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { AgentCreatedEvent } from '@contracts/events';
import { BootstrapSkillCatalogService } from '../services/bootstrap-skill-catalog.service.js';

@Injectable()
export class AgentCreatedDefaultSkillsListener implements OnModuleInit {
  private readonly logger = new Logger(AgentCreatedDefaultSkillsListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly bootstrapSkillCatalog: BootstrapSkillCatalogService,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<AgentCreatedEvent>(
      'agent.created',
      this.handle.bind(this),
      {
        queue: 'agents-default-skills-queue',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: AgentCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    const { agentId, role } = event.data;
    if (!companyId || !agentId) {
      return;
    }
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        const { resolvedSkillIds } = await this.bootstrapSkillCatalog.ensureCompanyCatalogThenBindToAgent(
          companyId,
          agentId,
          role,
        );
        this.logger.log('Default skills bound for new agent', {
          agentId,
          companyId,
          role,
          count: resolvedSkillIds.length,
        });
      } catch (err: any) {
        this.logger.error('Default skills bind failed', {
          agentId,
          companyId,
          error: err?.message,
        });
        throw err;
      }
    });
  }
}
