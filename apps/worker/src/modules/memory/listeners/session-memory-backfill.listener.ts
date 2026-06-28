import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { MemorySessionBackfillRequestedEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';

interface ChatRoomShape {
  id: string;
  name: string;
  taskId?: string | null;
}

interface ChatMessageShape {
  id: string;
  roomId: string;
  threadId?: string | null;
  senderId?: string;
  senderType: 'human' | 'agent';
  messageType: string;
  content: string;
  createdAt?: string | null;
}

@Injectable()
export class SessionMemoryBackfillListener implements OnModuleInit {
  private readonly logger = new Logger(SessionMemoryBackfillListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    private readonly monitoring: MonitoringService,
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
      const nowMs = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
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
            const createdAtMs = msg.createdAt ? Date.parse(msg.createdAt) : nowMs;
            const isRecent = Number.isFinite(createdAtMs) ? nowMs - createdAtMs <= sevenDaysMs : true;
            const isCeoFailureLesson =
              isRecent && /(heartbeat|supervisor|复盘|失败|报错|故障|parse|权限|memory namespace)/i.test(text);
            const metadata = {
              roomId: msg.roomId,
              threadId: msg.threadId ?? null,
              senderId: msg.senderId,
              senderType: msg.senderType,
              messageType: msg.messageType,
              memoryKind: isCeoFailureLesson ? 'ceo_failure_lesson' : 'collaboration_message',
              backfill: true,
              lessonCategory: isCeoFailureLesson ? 'ceo-loop-failure' : undefined,
            };
            await this.safeStore(companyId, actor, `session:${room.id}`, `Session room: ${room.name}`, text, msg.id, metadata);
            if (isCeoFailureLesson) {
              const roomInfo = await this.rpc<{ taskId?: string | null }>('collaboration.rooms.findOne', {
                companyId,
                actor,
                roomId: room.id,
              }).catch(() => null);
              const projectId = roomInfo?.taskId ?? null;
              const targetNs = projectId ? `project:${projectId}` : 'company';
              await this.safeStore(
                companyId,
                actor,
                targetNs,
                'CEO failure lessons backfill',
                text,
                msg.id,
                { ...metadata, promotedByBackfill: true, sourceRoomId: room.id, ...(projectId ? { projectId } : {}) },
              );
            }
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

  private async safeStore(
    companyId: string,
    actor: { id: string; roles: string[] },
    namespace: string,
    collectionLabel: string,
    content: string,
    sourceRef: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.rpc('memory.entries.store', {
        companyId,
        actor,
        data: { namespace, collectionLabel, content, sourceType: 'chat', sourceRef, metadata },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/MEMORY_NAMESPACE_FORBIDDEN|MEMORY_STORE_FORBIDDEN|无权/i.test(msg) || namespace === 'company') {
        return;
      }
      this.monitoring.incMemoryPermissionDenied('session_backfill_store');
      this.monitoring.incMemoryFallbackToCompany('session_backfill_store');
      await this.rpc('memory.entries.store', {
        companyId,
        actor,
        data: {
          namespace: 'company',
          collectionLabel: `${collectionLabel} (fallback)`,
          content,
          sourceType: 'chat',
          sourceRef,
          metadata: { ...metadata, fallbackFromNamespace: namespace },
        },
      }).catch(() => undefined);
    }
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc
        .send<T>(pattern, payload)
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }
}

