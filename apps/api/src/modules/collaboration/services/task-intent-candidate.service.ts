import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../entities/chat-message.entity.js';
import {
  TaskIntentCandidate,
  type TaskIntentCandidateStatus,
  type TaskIntentMissingField,
  type TaskIntentReadiness,
  type TaskSpecDraft,
} from '../entities/task-intent-candidate.entity.js';
import type { MessageActionCandidate } from '../entities/message-action-candidate.entity.js';
import type { ReplayDecision } from '../entities/replay-decision.entity.js';

@Injectable()
export class TaskIntentCandidateService {
  constructor(
    @InjectRepository(TaskIntentCandidate)
    private readonly candidatesRepo: Repository<TaskIntentCandidate>,
  ) {}

  async draftFromReplayDecision(input: {
    companyId: string;
    roomId: string;
    message: ChatMessage;
    replayDecision: ReplayDecision;
    actionCandidate?: MessageActionCandidate | null;
  }): Promise<TaskIntentCandidate> {
    const metadata = (input.message.metadata ?? {}) as Record<string, unknown>;
    const explicitSpec = this.readExplicitTaskSpec(metadata);
    const sourceText = input.replayDecision.summary || input.message.content.trim();
    const draft = this.buildSpecDraft({
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.message.id,
      actionCandidateId: input.actionCandidate?.id ?? null,
      sourceText,
      explicitSpec,
    });
    const readiness = this.evaluateReadiness(draft, explicitSpec);
    const status = this.resolveInitialStatus(readiness, explicitSpec);
    const dedupeKey = `task-intent:replay:${input.replayDecision.id}`;
    return this.upsertCandidate({
      companyId: input.companyId,
      roomId: input.roomId,
      sourceMessageId: input.message.id,
      actionCandidateId: input.actionCandidate?.id ?? null,
      dedupeKey,
      status,
      specDraft: draft,
      readiness,
      sourceText,
      metadata: {
        source: 'replay_decision',
        replayDecisionId: input.replayDecision.id,
        replayDecisionKind: input.replayDecision.kind,
        actionCandidateKind: input.actionCandidate?.kind ?? null,
        explicitSpecProvided: Object.keys(explicitSpec).length > 0,
        intakeSurface:
          input.replayDecision.kind === 'prepare_task_draft' ? 'collaboration_extract' : 'task_publish',
      },
    });
  }

  async findById(companyId: string, id: string): Promise<TaskIntentCandidate | null> {
    return this.candidatesRepo.findOne({ where: { companyId, id } });
  }

  async findLatestAwaitingConfirmation(input: {
    companyId: string;
    roomId: string;
  }): Promise<TaskIntentCandidate | null> {
    return this.candidatesRepo.findOne({
      where: {
        companyId: input.companyId,
        roomId: input.roomId,
        status: 'awaiting_confirmation',
      },
      order: { createdAt: 'DESC' },
    });
  }

  async patchSpecDraft(input: {
    candidate: TaskIntentCandidate;
    patch: Partial<TaskSpecDraft>;
    patchedByUserId: string;
  }): Promise<TaskIntentCandidate> {
    const candidate = input.candidate;
    const nextDraft: TaskSpecDraft = {
      ...candidate.specDraft,
      ...input.patch,
      title: input.patch.title !== undefined ? input.patch.title : candidate.specDraft.title,
      description: input.patch.description !== undefined ? input.patch.description : candidate.specDraft.description,
      acceptanceCriteria:
        input.patch.acceptanceCriteria !== undefined
          ? input.patch.acceptanceCriteria.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          : candidate.specDraft.acceptanceCriteria,
      source: candidate.specDraft.source,
    };
    const readiness = this.evaluateReadiness(nextDraft, nextDraft);
    candidate.specDraft = nextDraft;
    candidate.readiness = readiness;
    candidate.status = candidate.createdTaskId
      ? 'created'
      : readiness.ready
        ? 'ready_to_create'
        : 'needs_clarification';
    candidate.metadata = {
      ...(candidate.metadata ?? {}),
      patchedAt: new Date().toISOString(),
      patchedByUserId: input.patchedByUserId,
    };
    return this.candidatesRepo.save(candidate);
  }

  async markReadyAfterConfirmation(input: {
    candidate: TaskIntentCandidate;
    confirmationMessageId: string;
    replayDecisionId: string;
    actionCandidateId?: string | null;
  }): Promise<TaskIntentCandidate> {
    const candidate = input.candidate;
    candidate.status = 'ready_to_create';
    candidate.actionCandidateId = input.actionCandidateId ?? candidate.actionCandidateId;
    candidate.readiness = {
      ...candidate.readiness,
      ready: true,
      needsClarification: false,
      clarificationPrompt: null,
      reasons: [...new Set([...candidate.readiness.reasons, 'user_confirmed_execution'])],
    };
    candidate.metadata = {
      ...(candidate.metadata ?? {}),
      confirmedAt: new Date().toISOString(),
      confirmationMessageId: input.confirmationMessageId,
      replayDecisionId: input.replayDecisionId,
    };
    return this.candidatesRepo.save(candidate);
  }

  async draftFromMessage(input: {
    companyId: string;
    roomId: string;
    message: ChatMessage;
    actionCandidate?: MessageActionCandidate | null;
  }): Promise<TaskIntentCandidate> {
    const sourceText = input.message.content.trim();
    const metadata = (input.message.metadata ?? {}) as Record<string, unknown>;
    const explicitSpec = this.readExplicitTaskSpec(metadata);
    const draft = this.buildSpecDraft({
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.message.id,
      actionCandidateId: input.actionCandidate?.id ?? null,
      sourceText,
      explicitSpec,
    });
    const readiness = this.evaluateReadiness(draft, explicitSpec);
    const status = this.resolveInitialStatus(readiness, explicitSpec);
    const dedupeKey = `task-intent:${input.message.id}`;
    return this.upsertCandidate({
      companyId: input.companyId,
      roomId: input.roomId,
      sourceMessageId: input.message.id,
      actionCandidateId: input.actionCandidate?.id ?? null,
      dedupeKey,
      status,
      specDraft: draft,
      readiness,
      sourceText,
      metadata: {
        source: 'collaboration_message',
        actionCandidateKind: input.actionCandidate?.kind ?? null,
        messageCategory: metadata.messageCategory ?? null,
        explicitSpecProvided: Object.keys(explicitSpec).length > 0,
      },
    });
  }

  private async upsertCandidate(input: {
    companyId: string;
    roomId: string;
    sourceMessageId: string;
    actionCandidateId: string | null;
    dedupeKey: string;
    status: TaskIntentCandidateStatus;
    specDraft: TaskSpecDraft;
    readiness: TaskIntentReadiness;
    sourceText: string;
    metadata: Record<string, unknown>;
  }): Promise<TaskIntentCandidate> {
    const existing = await this.candidatesRepo.findOne({ where: { dedupeKey: input.dedupeKey } });
    const row = existing ?? this.candidatesRepo.create({ dedupeKey: input.dedupeKey });
    row.companyId = input.companyId;
    row.roomId = input.roomId;
    row.sourceMessageId = input.sourceMessageId;
    row.actionCandidateId = input.actionCandidateId;
    row.createdTaskId = row.createdTaskId ?? null;
    row.status = row.createdTaskId ? 'created' : input.status;
    row.specDraft = input.specDraft;
    row.readiness = input.readiness;
    row.sourceText = input.sourceText;
    row.metadata = input.metadata;
    return this.candidatesRepo.save(row);
  }

  private buildSpecDraft(input: {
    companyId: string;
    roomId: string;
    messageId: string;
    actionCandidateId: string | null;
    sourceText: string;
    explicitSpec: Partial<TaskSpecDraft>;
  }): TaskSpecDraft {
    const title =
      typeof input.explicitSpec.title === 'string' && input.explicitSpec.title.trim().length > 0
        ? input.explicitSpec.title.trim().slice(0, 512)
        : this.deriveConservativeTitle(input.sourceText);
    return {
      title,
      description:
        typeof input.explicitSpec.description === 'string' && input.explicitSpec.description.trim().length > 0
          ? input.explicitSpec.description.trim()
          : input.sourceText || null,
      priority: input.explicitSpec.priority ?? 'normal',
      dueDate: input.explicitSpec.dueDate ?? null,
      expectedOutput: input.explicitSpec.expectedOutput ?? null,
      assigneeType: input.explicitSpec.assigneeType ?? 'unassigned',
      assigneeId: input.explicitSpec.assigneeId ?? null,
      acceptanceCriteria: Array.isArray(input.explicitSpec.acceptanceCriteria)
        ? input.explicitSpec.acceptanceCriteria.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : [],
      reportBackToRoomId: input.roomId,
      source: {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        actionCandidateId: input.actionCandidateId,
      },
    };
  }

  private evaluateReadiness(
    draft: TaskSpecDraft,
    explicitSpec: Partial<TaskSpecDraft>,
  ): TaskIntentReadiness {
    const missingFields: TaskIntentMissingField[] = [];
    if (!draft.title) missingFields.push('title');
    if (!draft.description) missingFields.push('description');
    if (draft.assigneeType === 'unassigned' || !draft.assigneeId) missingFields.push('owner');
    if (!draft.expectedOutput) missingFields.push('deliverable');
    if (!draft.dueDate) missingFields.push('deadline');
    if (!draft.acceptanceCriteria.length) missingFields.push('acceptance_criteria');

    const explicitKeys = Object.keys(explicitSpec).length;
    const requiredMissing = missingFields.filter((f) => f === 'title' || f === 'description' || f === 'owner' || f === 'deliverable');
    const confidence = Math.max(0.1, Math.min(0.95, 0.25 + explicitKeys * 0.12 + (6 - missingFields.length) * 0.08));
    const ready = requiredMissing.length === 0 && confidence >= 0.65;
    const needsClarification = !ready;
    return {
      ready,
      confidence,
      missingFields,
      needsClarification,
      clarificationPrompt: needsClarification ? this.buildClarificationPrompt(missingFields) : null,
      reasons: [
        ...(ready ? ['task_spec_ready'] : ['task_spec_incomplete']),
        ...(explicitKeys > 0 ? ['explicit_task_spec_available'] : ['explicit_task_spec_missing']),
      ],
    };
  }

  private resolveInitialStatus(
    readiness: TaskIntentReadiness,
    explicitSpec: Partial<TaskSpecDraft>,
  ): TaskIntentCandidateStatus {
    if (readiness.ready && Object.keys(explicitSpec).length > 0) return 'ready_to_create';
    if (readiness.needsClarification) return 'needs_clarification';
    return 'awaiting_confirmation';
  }

  private readExplicitTaskSpec(metadata: Record<string, unknown>): Partial<TaskSpecDraft> {
    const raw = metadata.taskSpecDraft ?? metadata.taskSpec;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const obj = raw as Record<string, unknown>;
    const out: Partial<TaskSpecDraft> = {};
    if (typeof obj.title === 'string') out.title = obj.title;
    if (typeof obj.description === 'string') out.description = obj.description;
    if (obj.priority === 'low' || obj.priority === 'normal' || obj.priority === 'high' || obj.priority === 'urgent') {
      out.priority = obj.priority;
    }
    if (typeof obj.dueDate === 'string') out.dueDate = obj.dueDate;
    if (typeof obj.expectedOutput === 'string') out.expectedOutput = obj.expectedOutput;
    if (obj.assigneeType === 'agent' || obj.assigneeType === 'organization_node' || obj.assigneeType === 'unassigned') {
      out.assigneeType = obj.assigneeType;
    }
    if (typeof obj.assigneeId === 'string') out.assigneeId = obj.assigneeId;
    if (Array.isArray(obj.acceptanceCriteria)) {
      out.acceptanceCriteria = obj.acceptanceCriteria.filter((x): x is string => typeof x === 'string');
    }
    return out;
  }

  private deriveConservativeTitle(sourceText: string): string | null {
    const firstLine = sourceText.split('\n').map((line) => line.trim()).find(Boolean);
    if (!firstLine) return null;
    return firstLine.slice(0, 120);
  }

  private buildClarificationPrompt(missingFields: TaskIntentMissingField[]): string {
    const labels: Record<TaskIntentMissingField, string> = {
      title: '任务标题',
      description: '任务描述',
      owner: '主责部门或 Agent',
      deliverable: '预期产出',
      deadline: '截止时间',
      acceptance_criteria: '验收标准',
    };
    const required = missingFields.map((field) => labels[field]).join('、');
    return `我可以把这条消息整理成任务，但还需要补充：${required}。请补充后我再创建正式任务。`;
  }
}
