import { Injectable, Logger } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import {
  COLLABORATION_CHAT_MESSAGE_INGESTED_V2_ROUTING_KEY,
  type CollaborationChatMessageIngestedV2Event,
  type CollaborationMessageReceivedEvent,
} from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';
import type { ChatMessage } from '../entities/chat-message.entity.js';
import { MessageProcessingEventFactory } from './message-processing-event.factory.js';

/**
 * 人类/Agent 消息落库后立刻发布入站事件，驱动 Worker 流水线。
 * 与 legacy 定时 job（publish_received）互斥路由：V2 开 → ingested.v2，否则 message.received。
 */
@Injectable()
export class CollaborationMessageInboundPublisherService {
  private readonly logger = new Logger(CollaborationMessageInboundPublisherService.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly eventFactory: MessageProcessingEventFactory,
    private readonly config: ConfigService,
  ) {}

  async publishMessageReceived(companyId: string, message: ChatMessage): Promise<void> {
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const mentionedAgentIds = this.extractStringArray(metadata.mentionedAgentIds);
    const mentionedNodeIds = this.extractStringArray(metadata.mentionedNodeIds);
    const correlationId =
      typeof metadata.correlationId === 'string' && metadata.correlationId.trim().length > 0
        ? metadata.correlationId.trim()
        : message.id;

    const base = this.eventFactory.createReceivedEvent({
      companyId,
      messageId: message.id,
      roomId: message.roomId,
      seq: message.seq,
      senderType: message.senderType,
      senderId: message.senderId,
      messageType: message.messageType,
      contentPreview: message.content.slice(0, 2000),
      createdAt: message.createdAt?.toISOString() ?? new Date().toISOString(),
      threadId: message.threadId,
    });

    const receivedEvent: CollaborationMessageReceivedEvent = {
      ...base,
      data: {
        ...base.data,
        ...(mentionedAgentIds.length ? { mentionedAgentIds } : {}),
        ...(mentionedNodeIds.length ? { mentionedNodeIds } : {}),
        traceId: correlationId,
      },
    };

    const useDomainV2 = this.config.isAutonomousEventBusV2Enabled();
    if (useDomainV2) {
      const v2Event: CollaborationChatMessageIngestedV2Event = {
        ...receivedEvent,
        eventType: COLLABORATION_CHAT_MESSAGE_INGESTED_V2_ROUTING_KEY,
      };
      await this.messaging.publish(v2Event, {
        routingKey: COLLABORATION_CHAT_MESSAGE_INGESTED_V2_ROUTING_KEY,
        persistent: true,
      });
      this.logger.log('collaboration.chat.ingested.v2.published', {
        companyId,
        roomId: message.roomId,
        messageId: message.id,
      });
      return;
    }

    await this.messaging.publish(receivedEvent, {
      routingKey: 'collaboration.message.received',
      persistent: true,
    });
    this.logger.log('collaboration.message.received.published', {
      companyId,
      roomId: message.roomId,
      messageId: message.id,
    });
  }

  private extractStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter((x) => x.length > 0);
  }
}
