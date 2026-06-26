import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { TaskHeartbeatTickEvent } from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { ConversationOutputSanitizerService } from '../conversation-output-sanitizer.service.js';

@Injectable()
export class SupervisorRetrospectiveListener implements OnModuleInit {
  private readonly logger = new Logger(SupervisorRetrospectiveListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
    private readonly idempotency: IdempotencyService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<TaskHeartbeatTickEvent>(
      'task.heartbeat.tick',
      this.handle.bind(this),
      { queue: 'worker-supervisor-retrospective-queue', durable: true, prefetchCount: 10 },
    );
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private periodKey(freq: string, tickAt: string): string {
    const d = new Date(tickAt);
    if (freq === 'weekly') {
      const day = d.getUTCDay();
      const diff = (day + 6) % 7;
      d.setUTCDate(d.getUTCDate() - diff);
      return `weekly:${d.toISOString().slice(0, 10)}`;
    }
    return `daily:${d.toISOString().slice(0, 10)}`;
  }

  private async handle(event: TaskHeartbeatTickEvent): Promise<void> {
    const companyId = event.data.companyId;
    const tickAt = event.data.tickAt;
    try {
      const cfg = await firstValueFrom(
        this.apiRpc
          .send<{ enabled?: boolean; frequency?: 'hourly' | 'daily' | 'weekly' }>('companies.heartbeat.getConfig', {
            companyId,
            actor: this.workerActor(),
          })
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
      if (!cfg?.enabled) return;
      const freq = cfg.frequency ?? 'daily';
      if (freq !== 'daily' && freq !== 'weekly') return;
      const key = this.periodKey(freq, tickAt);
      const idem = `supervisor-retrospective:${companyId}:${key}`;
      if (!this.idempotency.markIfNew(idem, 8 * 24 * 60 * 60_000)) return;
      const retro = await firstValueFrom(
        this.apiRpc
          .send<Record<string, unknown>>('supervisor.metrics.retrospective', {
            companyId,
            actor: this.workerActor(),
          })
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
      await firstValueFrom(
        this.apiRpc
          .send('memory.entries.store', {
            companyId,
            actor: this.workerActor(),
            data: {
              namespace: 'company',
              collectionLabel: `supervisor_retrospective:${key}`,
              content: JSON.stringify(retro).slice(0, 12000),
              sourceType: 'summary',
              metadata: { source: 'supervisor_retrospective', period: key, tickAt },
            },
          })
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
      if (this.config.isSupervisorReviewChatSummaryEnabled()) {
        const room = await firstValueFrom(
          this.apiRpc
            .send<{ id?: string } | null>('collaboration.rooms.findMain', {
              companyId,
              actor: this.workerActor(),
            })
            .pipe(timeout(this.config.getApiRpcTimeoutMs())),
        );
        const roomId = room?.id?.trim();
        if (roomId) {
          const ceo = await firstValueFrom(
            this.apiRpc
              .send<{ items?: Array<{ id?: string }> }>('agents.findAll', {
                companyId,
                actor: this.workerActor(),
                role: 'ceo',
                status: 'active',
                page: 1,
                pageSize: 1,
              })
              .pipe(timeout(this.config.getApiRpcTimeoutMs())),
          );
          const ceoId = ceo?.items?.[0]?.id?.trim();
          if (ceoId) {
            const overview =
              typeof (retro as { overview?: unknown }).overview === 'string'
                ? String((retro as { overview?: unknown }).overview).slice(0, 400)
                : '';
            const title = key.startsWith('weekly:') ? '【Supervisor周报】' : '【Supervisor日报】';
            const content = ConversationOutputSanitizerService.toVisibleLayer(
              `${title}\n${overview || '复盘聚合已完成，详情已沉淀到公司记忆。'}`,
            );
            await firstValueFrom(
              this.apiRpc
                .send('collaboration.messages.appendAgent', {
                  companyId,
                  actor: this.workerActor(),
                  roomId,
                  agentId: ceoId,
                  content,
                  messageType: 'text',
                  metadata: { supervisorRetrospectiveSummary: true, period: key, tickAt },
                })
                .pipe(timeout(this.config.getApiRpcTimeoutMs())),
            );
          }
        }
      }
    } catch (e: unknown) {
      this.logger.warn('supervisor retrospective aggregation failed', {
        companyId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

