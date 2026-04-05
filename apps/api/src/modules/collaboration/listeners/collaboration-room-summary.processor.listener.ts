import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type {
  CollaborationRoomSummaryGeneratedEvent,
  CollaborationRoomSummaryRequestedEvent,
} from '@contracts/events';
import { ChatMessage } from '../entities/chat-message.entity.js';
import { MemorySummarizerService } from '../../memory/services/memory-summarizer.service.js';

/**
 * API 侧消费群聊总结请求：拉取消息、LLM 结构化总结、发布 generated（再由 Memory 监听器落库）
 */
@Injectable()
export class CollaborationRoomSummaryProcessorListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationRoomSummaryProcessorListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly summarizer: MemorySummarizerService,
    @InjectRepository(ChatMessage)
    private readonly messagesRepo: Repository<ChatMessage>,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CollaborationRoomSummaryRequestedEvent>(
      'collaboration.room.summary.requested',
      this.handle.bind(this),
      {
        queue: 'api-collab-room-summary-processor',
        durable: true,
        prefetchCount: 3,
      },
    );
  }

  private async handle(
    event: CollaborationRoomSummaryRequestedEvent,
  ): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const msgs = await this.messagesRepo.find({
        where: { roomId: event.data.roomId, companyId },
        order: { createdAt: 'ASC' as const },
        take: 200,
      });
      const lines = msgs
        .filter((m) => m.messageType !== 'stream_chunk')
        .map((m) => `${m.senderType}: ${m.content?.trim() ?? ''}`)
        .filter((t) => t.length > 2);
      const { summary } = await this.summarizer.summarize({
        texts: lines.length ? lines : ['（暂无可见消息）'],
        context: `房间 ${event.data.roomId}，模式 ${event.data.mode}`,
        structured: true,
        companyId,
        source: 'room',
        roomId: event.data.roomId,
      });

      const generated: CollaborationRoomSummaryGeneratedEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.room.summary.generated',
        aggregateId: event.data.roomId,
        aggregateType: 'chat_room',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          roomId: event.data.roomId,
          summary,
          messageCount: lines.length,
          generatedAt: new Date().toISOString(),
        },
      };
      await this.messaging.publish(generated, {
        routingKey: 'collaboration.room.summary.generated',
        persistent: true,
      });
      this.logger.log('collaboration.room.summary.generated', {
        roomId: event.data.roomId,
      });
    });
  }
}
