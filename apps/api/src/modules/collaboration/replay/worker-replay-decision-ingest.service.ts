import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CollaborationReplayDelegateCompletedEvent } from '@contracts/events';
import { ChatMessage } from '../entities/chat-message.entity.js';
import { MessageActionCandidateService } from '../services/message-action-candidate.service.js';
import { ExecutionIntakeService } from '../execution-intake/execution-intake.service.js';
import { ReplayDecisionService } from './replay-decision.service.js';
import type { ReplayDecisionKind } from './replay-decision.types.js';
import { CollaborationRealtimePublisher } from '../services/collaboration-realtime-publisher.service.js';

@Injectable()
export class WorkerReplayDecisionIngestService {
  private readonly logger = new Logger(WorkerReplayDecisionIngestService.name);

  constructor(
    private readonly replayDecisions: ReplayDecisionService,
    private readonly actionCandidates: MessageActionCandidateService,
    private readonly executionIntake: ExecutionIntakeService,
    private readonly collabRealtime: CollaborationRealtimePublisher,
    @InjectRepository(ChatMessage)
    private readonly messagesRepo: Repository<ChatMessage>,
  ) {}

  async ingest(event: CollaborationReplayDelegateCompletedEvent): Promise<void> {
    const companyId = String(event.companyId ?? '').trim();
    const data = event.data;
    const messageId = String(data.messageId ?? '').trim();
    if (!companyId || !messageId) return;

    const message = await this.messagesRepo.findOne({ where: { companyId, id: messageId } });
    if (!message) {
      this.logger.warn('worker_replay_ssot.message_not_found', { companyId, messageId });
      return;
    }

    const replayDecisionKind = data.replayDecisionKind as ReplayDecisionKind;
    const snapshot = {
      companyId,
      roomId: data.roomId,
      triggerMessageId: messageId,
      kind: replayDecisionKind,
      confidence: 0.9,
      requiresUserConfirmation: data.requiresUserConfirmation,
      targetDepartmentSlugs: data.targetDepartmentSlugs ?? [],
      targetAgentIds: data.targetAgentIds ?? [],
      summary: data.summary,
      rationale: data.rationale ?? [],
      executionHint: data.executionHint,
      source: 'worker_main_room_replay' as const,
    };

    const replayDecision = await this.replayDecisions.recordFromWorkerEvent({
      snapshot,
      workerTraceId: data.traceId,
      authorizationOutcome: data.authorizationOutcome,
    });

    const replayCandidate = await this.actionCandidates.upsertFromReplayDecision({
      companyId,
      decision: replayDecision,
    });

    await this.patchReplayDecisionMetadata(companyId, messageId, {
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

    const refreshed = await this.messagesRepo.findOne({ where: { companyId, id: messageId } });
    if (refreshed) {
      await this.collabRealtime.publishMessageMetadataUpdated(companyId, refreshed);
    }
  }

  private async patchReplayDecisionMetadata(
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
