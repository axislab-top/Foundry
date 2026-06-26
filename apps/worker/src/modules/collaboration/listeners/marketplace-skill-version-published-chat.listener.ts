import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { MarketplaceSkillVersionPublishedEvent } from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { ConversationOutputSanitizerService } from '../conversation-output-sanitizer.service.js';

/**
 * P20：商城钉选 Global Skill 新版本后，通知仍绑定旧版的公司主协作群；可选对非高危目标执行 Worker 自动安全升级。
 */
@Injectable()
export class MarketplaceSkillVersionPublishedChatListener implements OnModuleInit {
  private readonly logger = new Logger(MarketplaceSkillVersionPublishedChatListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
    private readonly idempotency: IdempotencyService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<MarketplaceSkillVersionPublishedEvent>(
      'marketplace.skill_version.published',
      this.handle.bind(this),
      {
        queue: 'worker-marketplace-skill-version-published-queue',
        durable: true,
        prefetchCount: 5,
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

  private async handle(event: MarketplaceSkillVersionPublishedEvent): Promise<void> {
    const ok = this.idempotency.markIfNew(
      `marketplace.skill_version.published:${event.eventId}`,
      48 * 60 * 60_000,
    );
    if (!ok) {
      this.logger.warn('duplicate marketplace.skill_version.published skipped', { eventId: event.eventId });
      return;
    }

    const actor = this.workerActor();
    const tmo = this.config.getCollaborationMentionRpcTimeoutMs();
    const agentLabel = event.data.agentName?.trim() || event.data.marketplaceAgentId;
    const pins = (event.data.publishedSkillIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);
    const content = ConversationOutputSanitizerService.toVisibleLayer(
      `【Skill 新版本】商城商品「${agentLabel}」已钉选 Global Skill 新版本。请在「公司详情 → Skill 版本」查看可用 semver 并一键升级；高危 Skill 升级需审批。`,
    );

    const maxCompanies = this.config.getMarketplaceBindingNotifyMaxCompanies();
    let companyIds = [...new Set((event.data.companyIds ?? []).map((x) => String(x).trim()).filter(Boolean))];
    if (companyIds.length > maxCompanies) {
      this.logger.warn('marketplace.skill_version.published company list truncated', {
        marketplaceAgentId: event.data.marketplaceAgentId,
        total: companyIds.length,
        maxCompanies,
      });
      companyIds = companyIds.slice(0, maxCompanies);
    }

    const autoSafe = this.config.getMarketplaceSkillAutoUpgradeSafe();

    for (const companyId of companyIds) {
      if (autoSafe && pins.length) {
        try {
          const res = await firstValueFrom(
            this.apiRpc
              .send<{ upgraded: number; skipped: number }>('marketplace.skills.workerAutoSafeUpgradePins', {
                companyId,
                actor,
                pinIds: pins,
              })
              .pipe(timeout(tmo)),
          );
          this.logger.log('marketplace skill auto safe upgrade batch', { companyId, ...res });
        } catch (e: unknown) {
          this.logger.warn('marketplace skill auto safe upgrade failed', {
            companyId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

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
                kind: 'marketplace_skill_version_published',
                marketplaceAgentId: event.data.marketplaceAgentId,
                publishedSkillIds: pins,
              },
            })
            .pipe(timeout(tmo)),
        );
      } catch (e: unknown) {
        this.logger.warn('marketplace skill version chat notify failed for company', {
          companyId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
