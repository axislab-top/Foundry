import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { AgentCreatedEvent } from '@contracts/events';
import { MemoryService } from '../services/memory.service.js';
import { agentNamespace } from '../utils/memory-namespace.js';

/** Agent 创建后预置其独立记忆集合 */
@Injectable()
export class AgentCreatedMemoryListener implements OnModuleInit {
  private readonly logger = new Logger(AgentCreatedMemoryListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly memory: MemoryService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<AgentCreatedEvent>(
      'agent.created',
      this.handle.bind(this),
      {
        queue: 'api-agent-created-memory',
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handle(event: AgentCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      await this.memory.ensureCollection(
        companyId,
        agentNamespace(event.data.agentId),
        `Agent: ${event.data.name}`,
        'agent.created',
      );
      this.logger.log('agent memory collection ready', {
        agentId: event.data.agentId,
      });
    });
  }
}
