import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { AgentMessageSchema, type AgentMessage } from '@foundry/multi-agent-core';
import { CollaborationRealtimePublisher } from '../services/collaboration-realtime-publisher.service.js';
import type { BaseEvent } from '@contracts/events';

@Injectable()
export class CollaborationAgentMessageAckListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationAgentMessageAckListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly realtime: CollaborationRealtimePublisher,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<BaseEvent & { data: unknown }>(
      'collaboration.agent-message.acked',
      this.handle.bind(this),
      {
        queue: 'api-collaboration-agent-message-ack',
        durable: true,
        prefetchCount: 50,
      },
    );
  }

  private async handle(event: BaseEvent & { data: unknown }): Promise<void> {
    const parsed = AgentMessageSchema.safeParse(event?.data);
    if (!parsed.success) {
      this.logger.warn('Invalid agent-message.acked dropped', {
        errors: parsed.error.format(),
      });
      return;
    }
    const ack: AgentMessage = parsed.data;
    const companyId = ack.context.companyId;
    const roomId = ack.context.sessionId;
    if (!companyId || !roomId) return;

    await this.realtime.publishEnvelope({
      companyId,
      roomId,
      event: 'agent-message:acked',
      payload: ack,
    });
  }
}

