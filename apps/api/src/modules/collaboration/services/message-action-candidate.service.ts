import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageActionCandidate } from '../entities/message-action-candidate.entity.js';
import type {
  MessageActionCandidateKind,
  MessageActionCandidateStatus,
} from '../entities/message-action-candidate.entity.js';
import type { ReplayDecision } from '../entities/replay-decision.entity.js';
import type {
  MessageActionDecision,
  MessageProcessingAction,
  MessageProcessingMode,
  MessageSemanticProfile,
} from './message-processing.types.js';
import type { ReplayDecisionKind } from '../replay/replay-decision.types.js';

const ACTION_CANDIDATE_KIND: Record<MessageProcessingAction, MessageActionCandidateKind> = {
  publish_received: 'received_event',
  extract_task_candidates: 'task_intent_candidate',
  route_mentions: 'mention_route',
  request_memory_index: 'memory_index',
};

const REPLAY_CANDIDATE_KIND: Partial<Record<ReplayDecisionKind, MessageActionCandidateKind>> = {
  ask_clarification: 'conversation_reply',
  start_discussion: 'discussion_route',
  summarize_discussion: 'discussion_route',
  propose_execution: 'coordination_route',
  prepare_task_draft: 'task_intent_candidate',
  confirm_execution: 'task_intent_candidate',
  dispatch_to_departments: 'coordination_route',
};

@Injectable()
export class MessageActionCandidateService {
  constructor(
    @InjectRepository(MessageActionCandidate)
    private readonly candidatesRepo: Repository<MessageActionCandidate>,
  ) {}

  async upsertFromDecision(input: {
    companyId: string;
    roomId: string;
    messageId: string;
    processingMode: MessageProcessingMode;
    profile: MessageSemanticProfile;
    decision: MessageActionDecision;
    payload?: Record<string, unknown>;
  }): Promise<MessageActionCandidate> {
    const kind = ACTION_CANDIDATE_KIND[input.decision.action];
    return this.upsert({
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      kind,
      processingMode: input.processingMode,
      sourceAction: input.decision.action,
      dedupeKey: `${kind}:${input.messageId}`,
      status: 'pending',
      visibility: kind === 'received_event' || kind === 'memory_index' ? 'internal' : 'user_facing',
      rationale: {
        intentCategory: input.profile.intentCategory,
        stage: input.profile.userFacingStage,
        reasonCodes: input.decision.reasonCodes,
        profileReasons: input.profile.reasons,
      },
      payload: input.payload ?? null,
    });
  }

  async upsertFromReplayDecision(input: {
    companyId: string;
    decision: ReplayDecision;
  }): Promise<MessageActionCandidate | null> {
    const kind = REPLAY_CANDIDATE_KIND[input.decision.kind];
    if (!kind) return null;
    return this.upsert({
      companyId: input.companyId,
      roomId: input.decision.roomId,
      messageId: input.decision.triggerMessageId,
      kind,
      processingMode:
        kind === 'task_intent_candidate'
          ? 'task_execution'
          : kind === 'discussion_route'
            ? 'discussion'
            : kind === 'memory_lookup'
              ? 'memory_lookup'
              : kind === 'approval_route'
                ? 'approval'
                : kind === 'report_capture'
                  ? 'report'
                  : 'coordination',
      sourceAction: null,
      dedupeKey: `replay:${kind}:${input.decision.id}`,
      status: 'pending',
      visibility: kind === 'conversation_reply' ? 'internal' : 'user_facing',
      rationale: {
        source: 'replay_decision',
        replayDecisionId: input.decision.id,
        replayKind: input.decision.kind,
        confidence: input.decision.confidence,
        reasons: input.decision.rationale,
      },
      payload: {
        replayDecisionId: input.decision.id,
        replayKind: input.decision.kind,
        requiresUserConfirmation: input.decision.requiresUserConfirmation,
        targetDepartmentSlugs: input.decision.targetDepartmentSlugs,
        targetAgentIds: input.decision.targetAgentIds,
        executionHint: input.decision.executionHint,
      },
    });
  }

  async findById(companyId: string, id: string): Promise<MessageActionCandidate | null> {
    return this.candidatesRepo.findOne({ where: { companyId, id } });
  }

  async markExecuted(candidate: MessageActionCandidate): Promise<MessageActionCandidate> {
    candidate.status = 'executed';
    return this.candidatesRepo.save(candidate);
  }

  async upsert(input: {
    companyId: string;
    roomId: string;
    messageId: string;
    dedupeKey: string;
    kind: MessageActionCandidateKind;
    processingMode: MessageProcessingMode;
    sourceAction?: MessageProcessingAction | null;
    status?: MessageActionCandidateStatus;
    visibility?: 'user_facing' | 'internal' | 'audit';
    rationale?: Record<string, unknown> | null;
    payload?: Record<string, unknown> | null;
  }): Promise<MessageActionCandidate> {
    const existing = await this.candidatesRepo.findOne({
      where: { dedupeKey: input.dedupeKey },
    });
    const row = existing ?? this.candidatesRepo.create({ dedupeKey: input.dedupeKey });
    row.companyId = input.companyId;
    row.roomId = input.roomId;
    row.messageId = input.messageId;
    row.kind = input.kind;
    row.processingMode = input.processingMode;
    row.sourceAction = input.sourceAction ?? null;
    row.status = input.status ?? row.status ?? 'pending';
    row.visibility = input.visibility ?? row.visibility ?? 'user_facing';
    row.rationale = input.rationale ?? null;
    row.payload = input.payload ?? null;
    return this.candidatesRepo.save(row);
  }
}
