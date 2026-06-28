import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { ConfigService } from '../../../common/config/config.service.js';
import type {
  CollaborationMemoryIndexRequestedEvent,
  CollaborationMentionRoutedEvent,
  CollaborationMessageReceivedEvent,
  CollaborationTaskExtractedEvent,
} from '@contracts/events';
import { ChatMessage } from '../entities/chat-message.entity.js';
import type { MessageEnvelope, MessageProcessingAction } from './message-processing.types.js';
import { MessageProcessingPolicyService } from './message-processing-policy.service.js';
import { MessageActionCandidateService } from './message-action-candidate.service.js';
import { MessageProcessingDecisionService } from './message-processing-decision.service.js';
import { MessageProcessingJobService } from './message-processing-job.service.js';
import { MessageProcessingEventFactory } from './message-processing-event.factory.js';
import { ReplayDecisionService } from '../replay/replay-decision.service.js';
import { ExecutionIntakeService } from '../execution-intake/execution-intake.service.js';
import { CollaborationRealtimePublisher } from './collaboration-realtime-publisher.service.js';
import { CollaborationMessageInboundPublisherService } from './collaboration-message-inbound-publisher.service.js';

const ACTION_DOMAIN: Record<MessageProcessingAction, 'message' | 'task' | 'routing' | 'memory'> = {
  publish_received: 'message',
  extract_task_candidates: 'task',
  route_mentions: 'routing',
  request_memory_index: 'memory',
};

@Injectable()
export class MessageProcessingOrchestratorService {
  private readonly logger = new Logger(MessageProcessingOrchestratorService.name);

  constructor(
    private readonly policy: MessageProcessingPolicyService,
    private readonly decisions: MessageProcessingDecisionService,
    private readonly candidates: MessageActionCandidateService,
    private readonly jobs: MessageProcessingJobService,
    private readonly eventFactory: MessageProcessingEventFactory,
    private readonly replayDecisions: ReplayDecisionService,
    private readonly executionIntake: ExecutionIntakeService,
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
    private readonly collabRealtime: CollaborationRealtimePublisher,
    private readonly inboundPublisher: CollaborationMessageInboundPublisherService,
    @InjectRepository(ChatMessage)
    private readonly messagesRepo: Repository<ChatMessage>,
  ) {}

  async process(companyId: string, message: ChatMessage): Promise<void> {
    const envelope: MessageEnvelope = {
      companyId,
      message,
      senderType: message.senderType,
      messageType: message.messageType,
      metadata: message.metadata ?? {},
      content: message.content ?? '',
    };
    const profile = this.policy.buildSemanticProfile(envelope);
    const decisions = this.policy.decideActions(profile, envelope);
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const correlationId =
      typeof metadata.correlationId === 'string' && metadata.correlationId.trim().length > 0
        ? metadata.correlationId
        : message.id;
    await this.decisions.record({
      companyId,
      messageId: message.id,
      roomId: message.roomId,
      correlationId,
      traceId: correlationId,
      profile,
      decisions,
    });
    await this.patchProcessingStatus(companyId, message.id, {
      stage: profile.userFacingStage,
      mode: profile.processingMode,
      intentCategory: profile.intentCategory,
      reasonCodes: profile.reasons,
      updatedAt: new Date().toISOString(),
    });

    for (const decision of decisions) {
      if (!decision.allow) continue;
      const domain = ACTION_DOMAIN[decision.action];
      const payload = {
        companyId,
        messageId: message.id,
        roomId: message.roomId,
        senderType: message.senderType,
        messageType: message.messageType,
        action: decision.action,
        domain,
        correlationId,
        profile,
      };
      const candidate = await this.candidates.upsertFromDecision({
        companyId,
        messageId: message.id,
        roomId: message.roomId,
        processingMode: profile.processingMode,
        profile,
        decision,
        payload,
      });
      const job = await this.jobs.upsertPending({
        companyId,
        messageId: message.id,
        roomId: message.roomId,
        domain,
        jobType: decision.action,
        dedupeKey: `${decision.action}:${message.id}`,
        aggregateType: 'message_action_candidate',
        aggregateId: candidate.id,
        correlationId,
        payload: {
          ...payload,
          actionCandidateId: candidate.id,
          actionCandidateKind: candidate.kind,
        },
      });

      if (decision.action === 'publish_received') {
        try {
          await this.inboundPublisher.publishMessageReceived(companyId, message);
          await this.jobs.markSucceeded(job);
        } catch (error: unknown) {
          this.logger.error('collaboration.inbound_publish_failed', {
            companyId,
            messageId: message.id,
            roomId: message.roomId,
            err: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (message.senderType === 'human' && message.messageType !== 'stream_chunk') {
      const isMainRoom = await this.replayDecisions.isMainRoom(companyId, message.roomId);
      if (!isMainRoom) {
        const replayDecision = await this.replayDecisions.decideForNonMainRoomMessage(companyId, message);
        const replayCandidate = await this.candidates.upsertFromReplayDecision({
          companyId,
          decision: replayDecision,
        });
        await this.patchReplayDecision(companyId, message.id, {
          id: replayDecision.id,
          kind: replayDecision.kind,
          confidence: replayDecision.confidence,
          requiresUserConfirmation: replayDecision.requiresUserConfirmation,
          targetDepartmentSlugs: replayDecision.targetDepartmentSlugs,
          targetAgentIds: replayDecision.targetAgentIds,
          summary: replayDecision.summary,
          rationale: replayDecision.rationale,
          actionCandidateId: replayCandidate?.id ?? null,
          updatedAt: new Date().toISOString(),
        });
        await this.executionIntake.intakeReplayDecision({
          companyId,
          message,
          replayDecision,
          actionCandidate: replayCandidate,
        });
        const refreshed = await this.messagesRepo.findOne({ where: { companyId, id: message.id } });
        if (refreshed) {
          await this.collabRealtime.publishMessageMetadataUpdated(companyId, refreshed);
        }
      }
    }
  }

  async inferRequestCategory(message: ChatMessage): Promise<'upgrade_request' | 'coordination' | 'report' | 'task_publish' | 'decision'> {
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    if (metadata.messageCategory === 'upgrade_request') return 'upgrade_request';
    if (metadata.messageCategory === 'task_publish') return 'task_publish';
    if (metadata.messageCategory === 'report') return 'report';
    if (metadata.messageCategory === 'coordination') return 'coordination';
    return 'decision';
  }

  private async patchProcessingStatus(
    companyId: string,
    messageId: string,
    status: Record<string, unknown>,
  ): Promise<void> {
    await this.messagesRepo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({
        metadata: () =>
          `jsonb_set(COALESCE(metadata, '{}'::jsonb), '{processingStatus}', :processingStatus::jsonb, true)`,
      })
      .where('id = :messageId AND company_id = :companyId', { messageId, companyId })
      .setParameter('processingStatus', JSON.stringify(status))
      .execute();
  }

  private async patchReplayDecision(
    companyId: string,
    messageId: string,
    replayDecision: Record<string, unknown>,
  ): Promise<void> {
    await this.messagesRepo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({
        metadata: () =>
          `jsonb_set(COALESCE(metadata, '{}'::jsonb), '{replayDecision}', :replayDecision::jsonb, true)`,
      })
      .where('id = :messageId AND company_id = :companyId', { messageId, companyId })
      .setParameter('replayDecision', JSON.stringify(replayDecision))
      .execute();
  }
}
