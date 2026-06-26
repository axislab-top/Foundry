import { Injectable, Logger } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { randomUUID } from 'crypto';
import type { CollaborationReplayDelegateCompletedEvent } from '@contracts/events';
import { COLLABORATION_REPLAY_DELEGATE_COMPLETED_ROUTING_KEY } from '@contracts/events';
import type { CeoAlignmentMetadata } from '@foundry/contracts/types/ceo-alignment';
import { ConfigService } from '../../../common/config/config.service.js';
import {
  mapAuthorizationToReplaySsotResult,
  readAudienceTargets,
  type MainRoomReplaySsotAuthorizationOutcome,
  type MainRoomReplaySsotRouteBypass,
} from './main-room-replay-ssot-mapper.util.js';

export type PublishMainRoomReplaySsotParams = {
  companyId: string;
  roomId: string;
  messageId: string;
  traceId: string;
  authorizationOutcome: MainRoomReplaySsotAuthorizationOutcome;
  discussionMode: boolean;
  messageMetadata?: Record<string, unknown>;
  draftGoalSummary?: string | null;
  ceoAlignment?: CeoAlignmentMetadata;
  routeBypass?: MainRoomReplaySsotRouteBypass;
};

@Injectable()
export class MainRoomReplaySsotPublisherService {
  private readonly logger = new Logger(MainRoomReplaySsotPublisherService.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return this.config.isCollabMainRoomReplaySsotPhase2Enabled();
  }

  async publishDelegateCompleted(params: PublishMainRoomReplaySsotParams): Promise<void> {
    if (!this.isEnabled()) return;

    const companyId = String(params.companyId ?? '').trim();
    const messageId = String(params.messageId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    const traceId = String(params.traceId ?? '').trim();
    if (!companyId || !messageId || !roomId) return;

    const metadata = params.messageMetadata ?? {};
    const mapped = mapAuthorizationToReplaySsotResult({
      authorizationOutcome: params.authorizationOutcome,
      discussionMode: params.discussionMode,
      messageMetadata: metadata,
      draftGoalSummary: params.draftGoalSummary,
      routeBypass: params.routeBypass ?? null,
    });
    const audienceTargets = readAudienceTargets(metadata);

    const event: CollaborationReplayDelegateCompletedEvent = {
      eventId: randomUUID(),
      eventType: COLLABORATION_REPLAY_DELEGATE_COMPLETED_ROUTING_KEY,
      aggregateId: messageId,
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: {
        messageId,
        roomId,
        traceId,
        authorizationOutcome: params.authorizationOutcome,
        replayDecisionKind: mapped.replayDecisionKind,
        draftGoalSummary: params.draftGoalSummary ?? null,
        ceoAlignment: params.ceoAlignment,
        executionHint: mapped.executionHint,
        requiresUserConfirmation: mapped.requiresUserConfirmation,
        targetDepartmentSlugs: audienceTargets.targetDepartmentSlugs,
        targetAgentIds: audienceTargets.targetAgentIds,
        summary: mapped.summary,
        rationale: mapped.rationale,
        routeBypass: params.routeBypass ?? null,
        completedAt: new Date().toISOString(),
      },
    };

    try {
      await this.messaging.publish(event, {
        routingKey: COLLABORATION_REPLAY_DELEGATE_COMPLETED_ROUTING_KEY,
        persistent: true,
      });
    } catch (e: unknown) {
      this.logger.warn('main_room.replay_ssot.publish_failed', {
        companyId,
        messageId,
        traceId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
