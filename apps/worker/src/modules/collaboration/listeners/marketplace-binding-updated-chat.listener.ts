import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { MarketplaceBindingUpdatedEvent } from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { ConversationOutputSanitizerService } from '../conversation-output-sanitizer.service.js';
import { CollaborationLlmKeyPoolCacheService } from '../collaboration-llm-key-pool-cache.service.js';

/**
 * 商城绑定变更后，向各公司已安装该公司的主协作群推送一条系统提示（建议同步本地 Agent 展示）。
 */
@Injectable()
export class MarketplaceBindingUpdatedChatListener implements OnModuleInit {
  private readonly logger = new Logger(MarketplaceBindingUpdatedChatListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
    private readonly idempotency: IdempotencyService,
    private readonly llmKeyPoolCache: CollaborationLlmKeyPoolCacheService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<MarketplaceBindingUpdatedEvent>(
      'marketplace.binding.updated',
      this.handle.bind(this),
      {
        queue: 'worker-marketplace-binding-updated-chat-queue',
        durable: true,
        prefetchCount: 10,
        retry: {
          enabled: true,
          maxAttempts: 4,
          initialDelayMs: 500,
          backoffFactor: 2,
          maxDelayMs: 30_000,
        },
      },
    );
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async handle(event: MarketplaceBindingUpdatedEvent): Promise<void> {
    const ok = this.idempotency.markIfNew(
      `marketplace.binding.updated:${event.eventId}`,
      48 * 60 * 60_000,
    );
    if (!ok) {
      this.logger.warn('duplicate marketplace.binding.updated skipped', { eventId: event.eventId });
      return;
    }

    const actor = this.workerActor();
    const tmo = this.config.getCollaborationMentionRpcTimeoutMs();
    const name = event.data.agentName?.trim() || event.data.marketplaceAgentId;
    const content = ConversationOutputSanitizerService.toVisibleLayer(
      `【商城配置更新】${name} 的配置已更新，系统已自动同步各公司已安装实例（模型、Key、提示词、技能、计费等）。`,
    );

    for (const target of event.data.installedAgentTargets ?? []) {
      const companyId = String(target.companyId ?? '').trim();
      const agentId = String(target.agentId ?? '').trim();
      if (!companyId || !agentId) continue;
      this.llmKeyPoolCache.invalidateAgent(companyId, agentId);
    }

    const maxCompanies = this.config.getMarketplaceBindingNotifyMaxCompanies();
    let companyIds = [...new Set((event.data.companyIds ?? []).map((x) => String(x).trim()).filter(Boolean))];
    if (companyIds.length > maxCompanies) {
      this.logger.warn('marketplace.binding.updated company list truncated', {
        marketplaceAgentId: event.data.marketplaceAgentId,
        total: companyIds.length,
        maxCompanies,
      });
      companyIds = companyIds.slice(0, maxCompanies);
    }

    for (const companyId of companyIds) {
      try {
        const room = await firstValueFrom(
          this.apiRpc
            .send<{ id?: string } | null>('collaboration.rooms.findMain', {
              companyId,
              actor,
            })
            .pipe(timeout(tmo)),
        );
        const roomId = room?.id?.trim();
        if (!roomId) continue;

        const ceo = await firstValueFrom(
          this.apiRpc
            .send<{ items?: Array<{ id?: string }> }>('agents.findAll', {
              companyId,
              actor,
              role: 'ceo',
              status: 'active',
              page: 1,
              pageSize: 1,
            })
            .pipe(timeout(tmo)),
        );
        const ceoId = ceo?.items?.[0]?.id?.trim();
        if (!ceoId) continue;

        await firstValueFrom(
          this.apiRpc
            .send('collaboration.messages.appendAgent', {
              companyId,
              actor,
              roomId,
              agentId: ceoId,
              content,
              messageType: 'text',
              metadata: {
                kind: 'marketplace_binding_updated',
                marketplaceAgentId: event.data.marketplaceAgentId,
                changedFields: event.data.changedFields,
              },
            })
            .pipe(timeout(tmo)),
        );
      } catch (e: unknown) {
        this.logger.warn('marketplace binding chat notify failed for company', {
          companyId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
