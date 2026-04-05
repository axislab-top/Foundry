import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { MemorySessionBackfillRequestedEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';

interface ChatRoomShape {
  id: string;
  name: string;
}

interface ChatMessageShape {
  id: string;
  roomId: string;
  threadId?: string | null;
  senderId?: string;
  senderType: 'human' | 'agent';
  messageType: string;
  content: string;
}

@Injectable()
export class SessionMemoryBackfillListener implements OnModuleInit {
  private readonly logger = new Logger(SessionMemoryBackfillListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<MemorySessionBackfillRequestedEvent>(
      'memory.session.backfill.requested',
      this.handle.bind(this),
      {
        queue: 'worker-memory-session-backfill',
        durable: true,
        prefetchCount: 1,
      },
    );
  }

  private async handle(event: MemorySessionBackfillRequestedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) return;
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const actor = {
        id: this.config.getWorkerActorUserId(),
        roles: ['admin'],
      };
      const rooms = event.data.roomId
        ? [{ id: event.data.roomId, name: 'Backfill room' }]
        : await this.rpc<ChatRoomShape[]>('collaboration.rooms.list', {
            companyId,
            actor,
          });
      const batch = Math.min(Math.max(event.data.batchSize ?? 200, 20), 500);
      for (const room of rooms) {
        let beforeSeq: number | undefined;
        let processed = 0;
        while (processed < batch) {
          const page = await this.rpc<{
            items: ChatMessageShape[];
            hasMore: boolean;
          }>('collaboration.messages.list', {
            companyId,
            actor,
            roomId: room.id,
            limit: Math.min(100, batch - processed),
            beforeSeq,
          });
          const items = page?.items ?? [];
          if (!items.length) break;
          for (const msg of items) {
            if (msg.messageType === 'stream_chunk') continue;
            const text = msg.content?.trim();
            if (!text) continue;
            await this.rpc('memory.entries.store', {
              companyId,
              actor,
              data: {
                namespace: `session:${room.id}`,
                collectionLabel: `Session room: ${room.name}`,
                content: text,
                sourceType: 'chat',
                sourceRef: msg.id,
                metadata: {
                  roomId: msg.roomId,
                  threadId: msg.threadId ?? null,
                  senderId: msg.senderId,
                  senderType: msg.senderType,
                  messageType: msg.messageType,
                  memoryKind: 'collaboration_message',
                  backfill: true,
                },
              },
            }).catch(() => undefined);
          }
          processed += items.length;
          const firstSeq = Number((items[0] as any)?.seq ?? 0);
          beforeSeq = Number.isFinite(firstSeq) && firstSeq > 1 ? firstSeq : 1;
          if (!page.hasMore || beforeSeq <= 1) break;
        }
      }
      this.logger.log('session memory backfill done', {
        companyId,
        roomCount: rooms.length,
      });
    });
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc
        .send<T>(pattern, payload)
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }
}

