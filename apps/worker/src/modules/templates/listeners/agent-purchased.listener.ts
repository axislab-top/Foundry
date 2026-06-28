import { Injectable, OnModuleInit } from '@nestjs/common';
import { createLogger, LogLevel } from '@service/logging';
import { MessagingService } from '@service/messaging';
import type { AgentPurchasedEvent } from '@contracts/events';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import { MarketplaceAgentMaterializationService } from '../marketplace-agent-materialization.service.js';

/**
 * 商城购买后物化 Agent（固定 llmModel + 固定 llmKeyId）。
 */
@Injectable()
export class AgentPurchasedListener implements OnModuleInit {
  private readonly logger = createLogger({
    service: 'worker-service',
    level: LogLevel.INFO,
  });

  constructor(
    private readonly messagingService: MessagingService,
    private readonly idempotency: IdempotencyService,
    private readonly tenantContext: TenantContextService,
    private readonly materialization: MarketplaceAgentMaterializationService,
  ) {}

  async onModuleInit() {
    await this.messagingService.subscribe<AgentPurchasedEvent>(
      'agent.purchased',
      this.handle.bind(this),
      {
        queue: 'agent-purchased-queue',
        durable: true,
        prefetchCount: 5,
        retry: {
          enabled: true,
          maxAttempts: 5,
          initialDelayMs: 1000,
          backoffFactor: 2,
          maxDelayMs: 60_000,
        },
      },
    );
  }

  private async handle(event: AgentPurchasedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event);
    if (companyId) {
      await this.tenantContext.runWithCompanyId(companyId, async () => {
        await this.process(event);
      });
      return;
    }
    await this.process(event);
  }

  private async process(event: AgentPurchasedEvent): Promise<void> {
    const idempotencyKey = `agent.purchased:${event.eventId}`;
    const ok = this.idempotency.markIfNew(idempotencyKey, 24 * 60 * 60_000);
    if (!ok) {
      this.logger.warn('Duplicate agent.purchased skipped', { eventId: event.eventId });
      return;
    }

    this.logger.info('Processing agent.purchased', {
      eventId: event.eventId,
      companyId: event.data.companyId,
      marketplaceAgentId: event.data.marketplaceAgentId,
      organizationNodeId: event.data.organizationNodeId,
    });

    try {
      await this.materialization.materializeFromAgentPurchased(event);
    } catch (err) {
      this.idempotency.release(idempotencyKey);
      throw err;
    }
  }
}

