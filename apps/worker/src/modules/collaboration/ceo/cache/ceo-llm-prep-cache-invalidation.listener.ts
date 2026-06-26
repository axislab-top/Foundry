import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { BaseEvent } from '@contracts/events';
import { CeoLlmPrepCacheService } from './ceo-llm-prep-cache.service.js';
import { CeoLayerConfigResolverService } from '../resolver/ceo-layer-config-resolver.service.js';
import { DecisionConfigResolverService } from '../resolver/decision-config-resolver.service.js';

type GenericEvent = BaseEvent & {
  companyId?: string;
  data?: Record<string, unknown>;
};

@Injectable()
export class CeoLlmPrepCacheInvalidationListener implements OnModuleInit {
  private readonly logger = new Logger(CeoLlmPrepCacheInvalidationListener.name);
  private readonly events = [
    'ceo.config.updated',
    'company.budget.changed',
    'billing.budget.changed',
    'llm.key.pool.updated',
    'llm.key.used',
    'agent.updated',
  ] as const;

  constructor(
    private readonly messaging: MessagingService,
    private readonly llmPrepCache: CeoLlmPrepCacheService,
    private readonly layerConfigResolver: CeoLayerConfigResolverService,
    private readonly decisionConfigResolver: DecisionConfigResolverService,
  ) {}

  onModuleInit(): void {
    for (const eventType of this.events) {
      this.messaging.subscribeWithBackoff<GenericEvent>(
        eventType,
        (event) => this.handle(eventType, event),
        {
          queue: `worker-ceo-llm-prep-cache-${eventType.replace(/\./g, '-')}-queue`,
          durable: true,
          prefetchCount: 20,
        },
      );
    }
  }

  private async handle(eventType: string, event: GenericEvent): Promise<void> {
    const companyId =
      String(
        event.companyId ??
          event.data?.companyId ??
          event.data?.tenantId ??
          '',
      ).trim() || undefined;
    if (!companyId) return;

    const agentId =
      typeof event.data?.agentId === 'string'
        ? event.data.agentId
        : typeof event.data?.id === 'string'
          ? event.data.id
          : undefined;
    const ceoContext = typeof event.data?.ceoContext === 'string' ? event.data.ceoContext : undefined;

    // ceo.config.updated 需要同时覆盖 strategy/orchestration/supervision 分片；否则 '*' 只会 bump '*' 前缀。
    if (eventType === 'ceo.config.updated') {
      this.layerConfigResolver.invalidateCompany(companyId);
      this.decisionConfigResolver.invalidateCompany(companyId);
    }

    const bumpAll =
      eventType === 'ceo.config.updated' && (!ceoContext || ceoContext === '*' || ceoContext === 'all');

    let version = 0;
    if (bumpAll) {
      for (const ctx of ['intent', 'strategy', 'orchestration', 'supervision'] as const) {
        version = await this.llmPrepCache.bumpVersion({ companyId, agentId, ceoContext: ctx });
      }
    } else {
      version = await this.llmPrepCache.bumpVersion({ companyId, agentId, ceoContext });
    }
    this.logger.log('ceo llm_prep cache version bumped', {
      eventType,
      companyId,
      agentId: agentId ?? '*',
      ceoContext: bumpAll ? 'intent|strategy|orchestration|supervision' : ceoContext ?? '*',
      version,
    });
  }
}

