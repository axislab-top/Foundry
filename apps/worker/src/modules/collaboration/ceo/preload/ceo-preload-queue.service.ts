import { Injectable } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { CeoPreloadContextDto } from './dto/preload-context.dto.js';

@Injectable()
export class CeoPreloadQueueService {
  constructor(private readonly messaging: MessagingService) {}

  async enqueue(payload: CeoPreloadContextDto): Promise<void> {
    await this.messaging.publish(
      {
        eventId: `${payload.companyId}:${payload.roomId}:${Date.now()}`,
        eventType: 'ceo.preload.context',
        aggregateId: payload.roomId,
        aggregateType: 'collaboration_room',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: payload.companyId,
        data: payload,
      },
      {
        routingKey: 'ceo.preload.context',
        persistent: true,
      },
    );
  }
}

