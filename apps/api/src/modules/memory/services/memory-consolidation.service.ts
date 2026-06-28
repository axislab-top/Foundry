import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type {
  CollaborationMemoryConsolidateRequestedEvent,
  MemorySessionBackfillRequestedEvent,
} from '@contracts/events';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';
import { MemoryMetricsService } from './memory-metrics.service.js';

@Injectable()
export class MemoryConsolidationService {
  private readonly logger = new Logger(MemoryConsolidationService.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly metrics: MemoryMetricsService,
    @Optional() private readonly realtime?: CollaborationRealtimePublisher,
  ) {}

  async requestConsolidation(params: {
    companyId: string;
    roomId: string;
    trigger?: 'manual' | 'scheduled' | 'threshold' | 'backfill';
    sourceMessageId?: string;
    messageSeq?: string;
  }): Promise<{ accepted: true; eventId: string }> {
    const event: CollaborationMemoryConsolidateRequestedEvent = {
      eventId: randomUUID(),
      eventType: 'collaboration.memory.consolidate.requested',
      aggregateId: params.roomId,
      aggregateType: 'chat_room',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        roomId: params.roomId,
        trigger: params.trigger ?? 'manual',
        sourceMessageId: params.sourceMessageId,
        messageSeq: params.messageSeq,
        requestedAt: new Date().toISOString(),
      },
    };
    await this.messaging.publish(event, {
      routingKey: 'collaboration.memory.consolidate.requested',
      persistent: true,
    });
    this.logger.log('memory consolidation requested', {
      companyId: params.companyId,
      roomId: params.roomId,
      eventId: event.eventId,
    });
    this.metrics.incConsolidation('accepted');
    await this.realtime?.publishEnvelope({
      companyId: params.companyId,
      roomId: params.roomId,
      event: 'memory:consolidated',
      payload: {
        roomId: params.roomId,
        trigger: params.trigger ?? 'manual',
        eventId: event.eventId,
      },
    });
    return { accepted: true, eventId: event.eventId };
  }

  async requestSessionBackfill(params: {
    companyId: string;
    roomId?: string;
  }): Promise<{ accepted: true; eventId: string }> {
    const event: MemorySessionBackfillRequestedEvent = {
      eventId: randomUUID(),
      eventType: 'memory.session.backfill.requested',
      aggregateId: params.companyId,
      aggregateType: 'memory_backfill',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        companyId: params.companyId,
        roomId: params.roomId,
        requestedAt: new Date().toISOString(),
      },
    };
    await this.messaging.publish(event, {
      routingKey: 'memory.session.backfill.requested',
      persistent: true,
    });
    return { accepted: true, eventId: event.eventId };
  }
}

