import { Injectable } from '@nestjs/common';
import { MessageProcessingJobService } from './message-processing-job.service.js';
import type { ChatMessage } from '../entities/chat-message.entity.js';

@Injectable()
export class MessageProcessingPublisherService {
  constructor(private readonly jobs: MessageProcessingJobService) {}

  async enqueueFromMessage(companyId: string, message: ChatMessage): Promise<void> {
    await this.jobs.upsertPending({
      companyId,
      messageId: message.id,
      roomId: message.roomId,
      jobType: 'publish_received',
      dedupeKey: `publish_received:${message.id}`,
      payload: { messageId: message.id },
    });
  }
}
