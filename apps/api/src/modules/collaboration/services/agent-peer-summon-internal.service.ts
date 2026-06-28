import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import {
  COLLABORATION_AGENT_PEER_SUMMON_REQUESTED_ROUTING_KEY,
  type CollaborationAgentPeerSummonRequestedEvent,
} from '@contracts/events';
import { CollabRedisCacheService } from '../../../common/cache/collab-redis-cache.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { ChatMessageService } from './chat-message.service.js';
import { ChatRoomService } from './chat-room.service.js';
import { RoomMemberService } from './room-member.service.js';

const PEER_SUMMON_DEDUPE_TTL_MS = 10 * 60 * 1000;

export type AgentPeerSummonSendInput = {
  companyId: string;
  senderAgentId: string;
  targetAgentId: string;
  content: string;
  roomId?: string;
  expectReply?: boolean;
  threadId?: string;
  anchorMessageId?: string;
  metadata?: Record<string, unknown>;
};

export type AgentPeerSummonSendResult = {
  ok: true;
  roomId: string;
  messageId: string;
  summonAccepted: boolean;
};

@Injectable()
export class AgentPeerSummonInternalService {
  private readonly logger = new Logger(AgentPeerSummonInternalService.name);

  constructor(
    private readonly chatMessages: ChatMessageService,
    private readonly chatRooms: ChatRoomService,
    private readonly roomMembers: RoomMemberService,
    private readonly messaging: MessagingService,
    private readonly collabRedis: CollabRedisCacheService,
    private readonly config: ConfigService,
  ) {}

  async send(input: AgentPeerSummonSendInput): Promise<AgentPeerSummonSendResult> {
    const companyId = String(input.companyId ?? '').trim();
    const senderAgentId = String(input.senderAgentId ?? '').trim();
    const targetAgentId = String(input.targetAgentId ?? '').trim();
    const content = String(input.content ?? '').trim();

    if (!companyId || !senderAgentId || !targetAgentId) {
      throw new BadRequestException('companyId, senderAgentId and targetAgentId are required');
    }
    if (!content) {
      throw new BadRequestException('content is required');
    }
    if (senderAgentId === targetAgentId) {
      throw new BadRequestException('targetAgentId must differ from senderAgentId');
    }

    const room =
      (input.roomId ? await this.chatRooms.findOneOrFail(companyId, input.roomId) : null) ??
      (await this.chatRooms.findMainRoom(companyId));
    if (!room) {
      throw new BadRequestException('roomId is required: main room not found');
    }

    await this.roomMembers.addMembers(companyId, room.id, [
      { memberType: 'agent', memberId: targetAgentId },
    ]);

    const threadId = input.threadId?.trim() || null;
    const anchorMessageId = input.anchorMessageId?.trim() || null;
    const metadata: Record<string, unknown> = {
      ...(input.metadata ?? {}),
      source: 'agent_peer_summon_tool',
      summonTargetAgentIds: [targetAgentId],
      sentViaInternalTool: true,
      mentionedAgentIds: [targetAgentId],
      messageCategory: 'coordination',
      ...(anchorMessageId ? { directReplyToMessageId: anchorMessageId } : {}),
    };

    const msg = await this.chatMessages.appendAgentMessage(
      companyId,
      room.id,
      senderAgentId,
      content,
      'text',
      metadata,
      threadId,
    );

    const expectReply = input.expectReply !== false;
    if (!expectReply) {
      return { ok: true, roomId: room.id, messageId: msg.id, summonAccepted: false };
    }

    const dedupeKey = `${this.config.getRedisKeyPrefix()}peer_summon:${companyId}:${msg.id}:${targetAgentId}`;
    const acquired = await this.collabRedis.setNxPx(dedupeKey, '1', PEER_SUMMON_DEDUPE_TTL_MS);
    if (!acquired) {
      this.logger.debug('agent_peer_summon.dedupe_skip', {
        companyId,
        roomId: room.id,
        messageId: msg.id,
        targetAgentId,
      });
      return { ok: true, roomId: room.id, messageId: msg.id, summonAccepted: false };
    }

    const traceId = randomUUID();
    const event: CollaborationAgentPeerSummonRequestedEvent = {
      eventId: randomUUID(),
      eventType: COLLABORATION_AGENT_PEER_SUMMON_REQUESTED_ROUTING_KEY,
      aggregateId: msg.id,
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: {
        companyId,
        roomId: room.id,
        sourceMessageId: msg.id,
        senderAgentId,
        targetAgentId,
        contentPreview: content.slice(0, 2000),
        summonTargetAgentIds: [targetAgentId],
        threadId,
        anchorMessageId,
        traceId,
        requestedAt: new Date().toISOString(),
      },
    };

    await this.messaging.publish(event, {
      routingKey: COLLABORATION_AGENT_PEER_SUMMON_REQUESTED_ROUTING_KEY,
      persistent: true,
    });

    this.logger.log('agent_peer_summon.requested_published', {
      companyId,
      roomId: room.id,
      messageId: msg.id,
      senderAgentId,
      targetAgentId,
      traceId,
    });

    return { ok: true, roomId: room.id, messageId: msg.id, summonAccepted: true };
  }
}
