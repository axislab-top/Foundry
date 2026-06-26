import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import {
  COLLABORATION_AGENT_PEER_SUMMON_REQUESTED_ROUTING_KEY,
  type CollaborationAgentPeerSummonRequestedEvent,
} from '@contracts/events';
import { AgentPeerSummonService } from '../agent-peer-summon/agent-peer-summon.service.js';

@Injectable()
export class AgentPeerSummonListener implements OnModuleInit {
  private readonly logger = new Logger(AgentPeerSummonListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly peerSummon: AgentPeerSummonService,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<CollaborationAgentPeerSummonRequestedEvent>(
      'collaboration.agent-peer-summon.worker',
      async (event) => {
        try {
          await this.peerSummon.handleRequested(event);
        } catch (e: unknown) {
          this.logger.warn('agent_peer_summon.handle_failed', {
            error: e instanceof Error ? e.message : String(e),
            sourceMessageId: event?.data?.sourceMessageId,
            companyId: event?.data?.companyId ?? event?.companyId,
          });
        }
      },
      {
        queue: 'worker-collaboration-agent-peer-summon-queue',
        routingKey: COLLABORATION_AGENT_PEER_SUMMON_REQUESTED_ROUTING_KEY,
        durable: true,
        prefetchCount: 4,
      },
    );
  }
}
