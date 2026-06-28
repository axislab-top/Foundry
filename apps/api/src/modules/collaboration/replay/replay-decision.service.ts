import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../entities/chat-message.entity.js';
import { ChatRoom } from '../entities/chat-room.entity.js';
import { ReplayDecision } from '../entities/replay-decision.entity.js';
import type { ReplayDecisionKind, ReplayDecisionSnapshot } from './replay-decision.types.js';

@Injectable()
export class ReplayDecisionService {
  constructor(
    @InjectRepository(ReplayDecision)
    private readonly decisionsRepo: Repository<ReplayDecision>,
    @InjectRepository(ChatMessage)
    private readonly messagesRepo: Repository<ChatMessage>,
    @InjectRepository(ChatRoom)
    private readonly roomsRepo: Repository<ChatRoom>,
  ) {}

  async decideForNonMainRoomMessage(companyId: string, message: ChatMessage): Promise<ReplayDecision> {
    const recentMessages = await this.messagesRepo.find({
      where: { companyId, roomId: message.roomId },
      order: { createdAt: 'DESC' },
      take: 12,
    });
    const orderedRecent = recentMessages.reverse();
    const snapshot = this.buildNonMainRoomDecisionSnapshot(companyId, message, orderedRecent);
    return this.upsert(snapshot);
  }

  /** @deprecated 主群由 Worker SSOT 承接；请使用 {@link decideForNonMainRoomMessage}。 */
  async decideForMessage(companyId: string, message: ChatMessage): Promise<ReplayDecision> {
    const isMainRoom = await this.isMainRoom(companyId, message.roomId);
    if (isMainRoom) {
      return this.upsert(
        this.snapshot({
          companyId,
          message,
          kind: 'continue_conversation',
          confidence: 0.78,
          requiresUserConfirmation: false,
          targetAgentIds: [],
          targetDepartmentSlugs: [],
          summary: '主群 Replay 决策由 Worker SSOT 承接，API 规则引擎跳过。',
          rationale: ['main_room_worker_replay_ssot'],
        }),
      );
    }
    return this.decideForNonMainRoomMessage(companyId, message);
  }

  async isMainRoom(companyId: string, roomId: string): Promise<boolean> {
    const room = await this.roomsRepo.findOne({ where: { companyId, id: roomId } });
    return String(room?.roomType ?? '').trim() === 'main';
  }

  async recordFromWorkerEvent(input: {
    snapshot: ReplayDecisionSnapshot;
    workerTraceId?: string;
    authorizationOutcome?: string;
  }): Promise<ReplayDecision> {
    const dedupeKey = `replay:${input.snapshot.triggerMessageId}:${input.snapshot.kind}`;
    const existing = await this.decisionsRepo.findOne({ where: { dedupeKey } });
    const row = existing ?? this.decisionsRepo.create({ dedupeKey });
    row.companyId = input.snapshot.companyId;
    row.roomId = input.snapshot.roomId;
    row.triggerMessageId = input.snapshot.triggerMessageId;
    row.kind = input.snapshot.kind;
    row.confidence = input.snapshot.confidence;
    row.requiresUserConfirmation = input.snapshot.requiresUserConfirmation;
    row.targetDepartmentSlugs = input.snapshot.targetDepartmentSlugs;
    row.targetAgentIds = input.snapshot.targetAgentIds;
    row.summary = input.snapshot.summary;
    row.rationale = input.snapshot.rationale;
    row.executionHint = input.snapshot.executionHint ?? null;
    row.source = 'worker_main_room_replay';
    row.metadata = {
      recordedBy: 'WorkerReplaySsot',
      workerTraceId: input.workerTraceId ?? null,
      authorizationOutcome: input.authorizationOutcome ?? null,
    };
    return this.decisionsRepo.save(row);
  }

  private buildNonMainRoomDecisionSnapshot(
    companyId: string,
    message: ChatMessage,
    recentMessages: ChatMessage[],
  ): ReplayDecisionSnapshot {
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const audience = this.objectRecord(metadata.audienceDecision);
    const responseMode = typeof audience.responseMode === 'string' ? audience.responseMode : null;
    const responderType = typeof audience.responderType === 'string' ? audience.responderType : null;
    const targetAgentIds = this.stringArray(audience.targetAgentIds);
    const targetDepartmentSlugs = this.stringArray(audience.targetDepartmentSlugs);
    const explicitTaskSpec = this.objectRecord(metadata.taskSpecDraft ?? metadata.taskSpec);

    if (Object.keys(explicitTaskSpec).length > 0) {
      return this.snapshot({
        companyId,
        message,
        kind: 'prepare_task_draft',
        confidence: 0.94,
        requiresUserConfirmation: false,
        targetAgentIds,
        targetDepartmentSlugs,
        summary: '收到显式任务规格，进入执行入口准备任务草稿。',
        rationale: ['explicit_task_spec_present', 'execution_intake_allowed'],
        executionHint: {
          taskLike: true,
          expectedOutput: typeof explicitTaskSpec.expectedOutput === 'string' ? explicitTaskSpec.expectedOutput : undefined,
          acceptanceCriteria: this.stringArray(explicitTaskSpec.acceptanceCriteria),
          deadlineHint: typeof explicitTaskSpec.dueDate === 'string' ? explicitTaskSpec.dueDate : undefined,
        },
      });
    }

    if (responseMode === 'discussion' || responderType === 'multi_department') {
      return this.snapshot({
        companyId,
        message,
        kind: 'start_discussion',
        confidence: 0.84,
        requiresUserConfirmation: false,
        targetAgentIds,
        targetDepartmentSlugs,
        summary: '消息面向多个协作对象，进入讨论流程而不是直接执行。',
        rationale: ['audience_decision_discussion', 'multi_target_context'],
      });
    }

    const pendingExecutionProposal = this.findRecentReplayKind(recentMessages, 'propose_execution');
    const userConfirmed = this.hasExplicitConfirmation(metadata);
    if (pendingExecutionProposal && userConfirmed) {
      return this.snapshot({
        companyId,
        message,
        kind: 'confirm_execution',
        confidence: 0.88,
        requiresUserConfirmation: false,
        targetAgentIds,
        targetDepartmentSlugs,
        summary: '用户确认了最近的执行建议，进入执行入口。',
        rationale: ['recent_execution_proposal_found', 'explicit_confirmation'],
        executionHint: { taskLike: true },
      });
    }

    return this.snapshot({
      companyId,
      message,
      kind: 'continue_conversation',
      confidence: 0.64,
      requiresUserConfirmation: false,
      targetAgentIds,
      targetDepartmentSlugs,
      summary: '保持对话状态，等待更多上下文或显式执行入口。',
      rationale: ['no_replay_transition_matched'],
    });
  }

  private async upsert(snapshot: ReplayDecisionSnapshot): Promise<ReplayDecision> {
    const dedupeKey = `replay:${snapshot.triggerMessageId}:${snapshot.kind}`;
    const existing = await this.decisionsRepo.findOne({ where: { dedupeKey } });
    const row = existing ?? this.decisionsRepo.create({ dedupeKey });
    row.companyId = snapshot.companyId;
    row.roomId = snapshot.roomId;
    row.triggerMessageId = snapshot.triggerMessageId;
    row.kind = snapshot.kind;
    row.confidence = snapshot.confidence;
    row.requiresUserConfirmation = snapshot.requiresUserConfirmation;
    row.targetDepartmentSlugs = snapshot.targetDepartmentSlugs;
    row.targetAgentIds = snapshot.targetAgentIds;
    row.summary = snapshot.summary;
    row.rationale = snapshot.rationale;
    row.executionHint = snapshot.executionHint ?? null;
    row.source = snapshot.source;
    row.metadata = { recordedBy: 'ReplayDecisionService' };
    return this.decisionsRepo.save(row);
  }

  private snapshot(input: {
    companyId: string;
    message: ChatMessage;
    kind: ReplayDecisionKind;
    confidence: number;
    requiresUserConfirmation: boolean;
    targetDepartmentSlugs: string[];
    targetAgentIds: string[];
    summary: string;
    rationale: string[];
    executionHint?: ReplayDecisionSnapshot['executionHint'];
  }): ReplayDecisionSnapshot {
    return {
      companyId: input.companyId,
      roomId: input.message.roomId,
      triggerMessageId: input.message.id,
      kind: input.kind,
      confidence: input.confidence,
      requiresUserConfirmation: input.requiresUserConfirmation,
      targetDepartmentSlugs: input.targetDepartmentSlugs,
      targetAgentIds: input.targetAgentIds,
      summary: input.summary,
      rationale: input.rationale,
      executionHint: input.executionHint,
      source: 'conversation_replay',
    };
  }

  private findRecentReplayKind(messages: ChatMessage[], kind: ReplayDecisionKind): boolean {
    return messages.some((msg) => {
      const replay = this.objectRecord((msg.metadata ?? {}).replayDecision);
      return replay.kind === kind;
    });
  }

  private hasExplicitConfirmation(metadata: Record<string, unknown>): boolean {
    return metadata.userConfirmedExecution === true || metadata.confirmationIntent === 'confirm_execution';
  }

  private objectRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }
}
