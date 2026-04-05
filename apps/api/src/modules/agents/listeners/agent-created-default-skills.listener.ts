import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { AgentCreatedEvent } from '@contracts/events';
import { getDefaultGlobalSkillNamesForRole } from '../../skills/default-skills.js';
import { SkillsService } from '../../skills/services/skills.service.js';
import { AgentSkillService } from '../services/agent-skill.service.js';

@Injectable()
export class AgentCreatedDefaultSkillsListener implements OnModuleInit {
  private readonly logger = new Logger(AgentCreatedDefaultSkillsListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly skillsService: SkillsService,
    private readonly agentSkillService: AgentSkillService,
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
    const names = getDefaultGlobalSkillNamesForRole(role);
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        const skillIds = await this.skillsService.findGlobalSkillIdsByNames(names);
        await this.agentSkillService.bindDefaultSkillsForAgent(agentId, companyId, skillIds);
        this.logger.log('Default skills bound for new agent', {
          agentId,
          companyId,
          role,
          count: skillIds.length,
        });
      } catch (err: any) {
        this.logger.warn('Default skills bind failed', {
          agentId,
          companyId,
          error: err?.message,
        });
      }
    });
  }
}
