import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type {
  CollaborationMemoryConsolidateRequestedEvent,
  CollaborationMemoryIndexRequestedEvent,
} from '@contracts/events';
import { ChatMessage } from '../../collaboration/entities/chat-message.entity.js';
import { ChatRoom } from '../../collaboration/entities/chat-room.entity.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { MemoryService } from '../services/memory.service.js';
import { sessionNamespace } from '../utils/memory-namespace.js';

/**
 * 消费 collaboration.memory.index.requested：写入 PGVector（与 Chat 协作链路对接）
 */
@Injectable()
export class CollaborationMemoryIndexListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationMemoryIndexListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
    private readonly memory: MemoryService,
    @InjectRepository(ChatMessage)
    private readonly messagesRepo: Repository<ChatMessage>,
    @InjectRepository(ChatRoom)
    private readonly roomsRepo: Repository<ChatRoom>,
  ) {}

  private get consolidateThreshold(): number {
    return this.config.getMemoryConsolidationWindowMessages();
  }

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CollaborationMemoryIndexRequestedEvent>(
      'collaboration.memory.index.requested',
      this.handle.bind(this),
      {
        queue: 'api-collab-memory-index',
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handle(
    event: CollaborationMemoryIndexRequestedEvent,
  ): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const message = await this.messagesRepo.findOne({
        where: { id: event.data.messageId, companyId },
      });
      if (!message) {
        this.logger.warn('chat message not found for memory index', {
          messageId: event.data.messageId,
        });
        return;
      }

      if (message.messageType === 'stream_chunk') {
        return;
      }
      const text = message.content?.trim() ?? '';
      if (!text) return;

      const room = await this.roomsRepo.findOne({
        where: { id: message.roomId, companyId },
      });
      if (!room) return;

      const namespace = this.config.isSessionMemoryEnabled()
        ? sessionNamespace(room.id)
        : room.organizationNodeId
          ? `dept:${room.organizationNodeId}`
          : 'company';
      const label = `Session room: ${room.name}`;

      try {
        await this.memory.storeEntry({
          companyId,
          namespace,
          collectionLabel: label,
          content: text,
          sourceType: 'chat',
          sourceRef: message.id,
          metadata: {
            roomId: message.roomId,
            threadId: message.threadId ?? null,
            senderId: message.senderId,
            senderType: message.senderType,
            messageType: message.messageType,
            /** 便于 Hybrid 检索按来源过滤（与 GroupChat / Actor-Aware 设计对齐） */
            memoryKind: 'collaboration_message',
          },
          skipAccessCheck: true,
        });
        if (
          this.config.isMemoryConsolidationEnabled() &&
          Number.isFinite(Number(message.seq)) &&
          Number(message.seq) > 0 &&
          Number(message.seq) % this.consolidateThreshold === 0
        ) {
          await this.publishConsolidateRequested(companyId, room.id, message.id, message.seq);
        }
      } catch (e: any) {
        if (e instanceof ConflictException) {
          return;
        }
        this.logger.warn('memory index store failed', {
          message: e?.message,
          messageId: message.id,
        });
      }
    });
  }

  private async publishConsolidateRequested(
    companyId: string,
    roomId: string,
    sourceMessageId: string,
    messageSeq: string,
  ): Promise<void> {
    try {
      const event: CollaborationMemoryConsolidateRequestedEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.memory.consolidate.requested',
        aggregateId: roomId,
        aggregateType: 'chat_room',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          roomId,
          trigger: 'threshold',
          sourceMessageId,
          messageSeq,
          requestedAt: new Date().toISOString(),
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'collaboration.memory.consolidate.requested',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish collaboration.memory.consolidate.requested failed', {
        message: e?.message,
        roomId,
      });
    }
  }
}
