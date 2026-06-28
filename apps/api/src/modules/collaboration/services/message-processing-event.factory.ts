import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  CollaborationMemoryIndexRequestedEvent,
  CollaborationMentionRoutedEvent,
  CollaborationMessageReceivedEvent,
  CollaborationTaskExtractedEvent,
} from '@contracts/events';

@Injectable()
export class MessageProcessingEventFactory {
  createReceivedEvent(params: {
    companyId: string;
    messageId: string;
    roomId: string;
    seq?: string;
    senderType: string;
    senderId: string;
    messageType: string;
    contentPreview: string;
    createdAt: string;
    threadId: string | null;
  }): CollaborationMessageReceivedEvent {
    return {
      eventId: randomUUID(),
      eventType: 'collaboration.message.received',
      aggregateId: params.messageId,
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        messageId: params.messageId,
        roomId: params.roomId,
        seq: params.seq,
        senderType: params.senderType as CollaborationMessageReceivedEvent['data']['senderType'],
        senderId: params.senderId,
        messageType: params.messageType as CollaborationMessageReceivedEvent['data']['messageType'],
        contentPreview: params.contentPreview,
        createdAt: params.createdAt,
        threadId: params.threadId,
      },
    };
  }

  createTaskExtractedEvent(params: {
    companyId: string;
    roomId: string;
    sourceMessageId: string;
    title: string;
    description: string;
  }): CollaborationTaskExtractedEvent {
    return {
      eventId: randomUUID(),
      eventType: 'collaboration.task.extracted',
      aggregateId: params.roomId,
      aggregateType: 'chat_room',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        roomId: params.roomId,
        sourceMessageId: params.sourceMessageId,
        title: params.title,
        description: params.description,
        extractedAt: new Date().toISOString(),
      },
    };
  }

  createMentionRoutedEvent(params: {
    companyId: string;
    messageId: string;
    roomId: string;
    mentionedAgentIds: string[];
  }): CollaborationMentionRoutedEvent {
    return {
      eventId: randomUUID(),
      eventType: 'collaboration.mention.routed',
      aggregateId: params.messageId,
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        messageId: params.messageId,
        roomId: params.roomId,
        mentionedAgentIds: params.mentionedAgentIds,
        routedAt: new Date().toISOString(),
      },
    };
  }

  createMemoryIndexRequestedEvent(params: {
    companyId: string;
    messageId: string;
    roomId: string;
    contentPreview: string;
  }): CollaborationMemoryIndexRequestedEvent {
    return {
      eventId: randomUUID(),
      eventType: 'collaboration.memory.index.requested',
      aggregateId: params.messageId,
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        messageId: params.messageId,
        roomId: params.roomId,
        requestedAt: new Date().toISOString(),
      },
    };
  }
}
