import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { MessagingService } from '@service/messaging';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../../common/config/config.service.js';
const COLLABORATION_MESSAGE_RECEIVED_LEGACY_RK = 'collaboration.message.received' as const;
const COLLABORATION_CHAT_MESSAGE_INGESTED_V2_RK = 'collaboration.chat.message.ingested.v2' as const;
import { MonitoringService } from '../../../../common/monitoring/monitoring.service.js';
import { CeoOrchestrationCacheService } from '../cache/ceo-orchestration-cache.service.js';
import { CeoPreloadQueueService } from './ceo-preload-queue.service.js';
import { CeoPreloadStrategyService } from './ceo-preload-strategy.service.js';
import type { CeoPreloadContextDto } from './dto/preload-context.dto.js';

@Injectable()
export class CeoPreloadWorkerService implements OnModuleInit {
  private readonly logger = new Logger(CeoPreloadWorkerService.name);
  private inflight = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
    private readonly monitoring: MonitoringService,
    private readonly queue: CeoPreloadQueueService,
    private readonly strategy: CeoPreloadStrategyService,
    private readonly orchestrationCache: CeoOrchestrationCacheService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<any>(
      'collaboration.ceo_preload.chat_message_trigger',
      async (event) => this.onMessageReceived(event),
      {
        queue: 'worker-ceo-preload-trigger-message-queue',
        routingKey: [COLLABORATION_MESSAGE_RECEIVED_LEGACY_RK, COLLABORATION_CHAT_MESSAGE_INGESTED_V2_RK],
        durable: true,
        prefetchCount: 20,
      },
    );
    for (const eventType of ['ceo.config.updated', 'billing.budget.changed', 'agent.updated']) {
      this.messaging.subscribeWithBackoff<any>(
        eventType,
        async (event) => this.onGenericTrigger(eventType as any, event),
        { queue: `worker-ceo-preload-trigger-${eventType.replace(/\./g, '-')}-queue`, durable: true, prefetchCount: 10 },
      );
    }
    this.messaging.subscribeWithBackoff<any>(
      'ceo.preload.context',
      async (event) => this.consumePreload(event),
      {
        queue: 'ceo-preload-queue',
        durable: true,
        prefetchCount: this.config.getCeoPreloadPrefetch(),
      },
    );
  }

  private async acquireSlot(): Promise<void> {
    const max = this.config.getCeoPreloadMaxConcurrency();
    if (this.inflight < max) {
      this.inflight += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.inflight += 1;
  }

  private releaseSlot(): void {
    this.inflight = Math.max(0, this.inflight - 1);
    const next = this.waiting.shift();
    if (next) next();
  }

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private rpcTimeoutMs() {
    return this.config.getCollaborationMentionRpcTimeoutMs();
  }

  private async loadContext(companyId: string, roomId: string): Promise<{ room: unknown; ceoId: string | null }> {
    const [room, ceoRes] = await Promise.all([
      firstValueFrom(
        this.apiRpc
          .send<{ collaborationMode?: string; metadata?: Record<string, unknown> | null }>('collaboration.rooms.findOne', {
            companyId,
            actor: this.actor(),
            roomId,
          })
          .pipe(timeout(this.rpcTimeoutMs())),
      ),
      firstValueFrom(
        this.apiRpc
          .send<{ items?: Array<{ id: string }> }>('agents.findAll', {
            companyId,
            actor: this.actor(),
            role: 'ceo',
            status: 'active',
            page: 1,
            pageSize: 1,
          })
          .pipe(timeout(this.rpcTimeoutMs())),
      ),
    ]);
    return { room, ceoId: ceoRes?.items?.[0]?.id ?? null };
  }

  private async onMessageReceived(event: any): Promise<void> {
    if (!this.config.isCeoPreloadEnabled()) return;
    const companyId = String(event?.companyId ?? '').trim();
    const roomId = String(event?.data?.roomId ?? '').trim();
    if (!companyId || !roomId) return;
    const mentioned = Array.isArray(event?.data?.mentionedAgentIds) ? event.data.mentionedAgentIds : [];
    const isPotentialMention = mentioned.length > 0;
    if (!isPotentialMention) return;
    await this.queue.enqueue({ companyId, roomId, reason: 'message' });
  }

  private async onGenericTrigger(
    reason: 'ceo.config.updated' | 'billing.budget.changed' | 'agent.updated',
    event: any,
  ): Promise<void> {
    if (!this.config.isCeoPreloadEnabled()) return;
    const companyId = String(event?.companyId ?? event?.data?.companyId ?? '').trim();
    const roomId = String(event?.data?.roomId ?? '').trim();
    if (!companyId || !roomId) return;
    const mappedReason =
      reason === 'ceo.config.updated'
        ? 'ceo_config'
        : reason === 'billing.budget.changed'
          ? 'budget'
          : 'agent';
    await this.queue.enqueue({ companyId, roomId, reason: mappedReason });
  }

  private async consumePreload(event: any): Promise<void> {
    if (!this.config.isCeoPreloadEnabled()) return;
    const payload = (event?.data ?? event ?? {}) as Partial<CeoPreloadContextDto>;
    const companyId = String(payload.companyId ?? '').trim();
    const roomId = String(payload.roomId ?? '').trim();
    if (!companyId || !roomId) return;
    if (!this.strategy.shouldPreload({ companyId, roomId })) {
      this.monitoring.incCeoPreloadSkip();
      return;
    }
    await this.acquireSlot();
    const started = Date.now();
    try {
      await this.orchestrationCache.preload({
        companyId,
        roomId,
        loader: async () => this.loadContext(companyId, roomId),
      });
      this.monitoring.incCeoPreloadSuccess();
    } catch (e) {
      this.monitoring.incCeoPreloadFail(roomId);
      this.logger.warn('ceo preload failed', {
        companyId,
        roomId,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      this.monitoring.observeCeoPreloadDurationMs(Date.now() - started);
      this.releaseSlot();
    }
  }
}

