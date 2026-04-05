import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type { CollaborationRoomSummaryRequestedEvent } from '@contracts/events';

/**
 * 群聊总结请求：由 API {@link CollaborationRoomSummaryProcessorListener} 拉取消息、LLM 总结后发布
 * {@link CollaborationRoomSummaryGeneratedEvent}，再由 Memory 监听器写入长期记忆。
 */
@Injectable()
export class CollaborationSummaryService {
  private readonly logger = new Logger(CollaborationSummaryService.name);

  constructor(private readonly messaging: MessagingService) {}

  async requestRoomSummary(params: {
    companyId: string;
    roomId: string;
    requestedByUserId: string;
    mode?: 'manual' | 'scheduled';
  }): Promise<{ eventId: string }> {
    const mode = params.mode ?? 'manual';
    const event: CollaborationRoomSummaryRequestedEvent = {
      eventId: randomUUID(),
      eventType: 'collaboration.room.summary.requested',
      aggregateId: params.roomId,
      aggregateType: 'chat_room',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        roomId: params.roomId,
        requestedByUserId: params.requestedByUserId,
        mode,
        requestedAt: new Date().toISOString(),
      },
    };
    await this.messaging.publish(event, {
      routingKey: 'collaboration.room.summary.requested',
      persistent: true,
    });
    this.logger.log('Room summary requested', {
      roomId: params.roomId,
      eventId: event.eventId,
    });
    return { eventId: event.eventId };
  }
}
