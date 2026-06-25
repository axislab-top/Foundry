import type {
  CeoAlignmentMetadata,
  CeoAlignmentPhase,
  CeoPipelineProgressMetadata,
} from "@contracts/types/collaboration-2026";

export type ReplayDecisionKindView =
  | "continue_conversation"
  | "ask_clarification"
  | "start_discussion"
  | "summarize_discussion"
  | "propose_execution"
  | "prepare_task_draft"
  | "confirm_execution"
  | "dispatch_to_departments"
  | "no_op";

export type ReplayDecisionView = {
  kind: ReplayDecisionKindView;
  requiresUserConfirmation?: boolean;
  summary?: string;
  rationale?: string[];
};

export type ProcessingStatusView = {
  stage?: string;
  mode?: string;
  status?: string;
  taskIntentCandidateId?: string;
};

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readNestedMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const lso = objectRecord(metadata.lightStructuredOutputV2);
  const nested = objectRecord(lso.metadata);
  return nested;
}

function isAlignmentPhase(value: unknown): value is CeoAlignmentPhase {
  return (
    value === "idle" ||
    value === "aligning" ||
    value === "awaiting_execution_confirm" ||
    value === "authorized" ||
    value === "executing" ||
    value === "replied"
  );
}

export function parseCeoAlignment(
  metadata: Record<string, unknown> | null | undefined,
): CeoAlignmentMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const top = objectRecord(metadata.ceoAlignment);
  const nested = objectRecord(readNestedMetadata(metadata).ceoAlignment);
  const raw = Object.keys(top).length > 0 ? top : nested;
  const phase = raw.phase;
  if (!isAlignmentPhase(phase)) return null;
  return {
    phase,
    draftGoalSummary: typeof raw.draftGoalSummary === "string" ? raw.draftGoalSummary : null,
    proposedHeavyPipelineKind:
      typeof raw.proposedHeavyPipelineKind === "string" ? raw.proposedHeavyPipelineKind : null,
    authorizationMessageId:
      typeof raw.authorizationMessageId === "string" ? raw.authorizationMessageId : null,
    authorizedAt: typeof raw.authorizedAt === "string" ? raw.authorizedAt : null,
    suggestedCollaborationMode: raw.suggestedCollaborationMode === "execution" ? "execution" : null,
    executionIntentDetected: raw.executionIntentDetected === true,
    upgradeReason: typeof raw.upgradeReason === "string" ? raw.upgradeReason : null,
    correlationId: typeof raw.correlationId === "string" ? raw.correlationId : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function parseCeoPipelineProgress(
  metadata: Record<string, unknown> | null | undefined,
): CeoPipelineProgressMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const top = objectRecord(metadata.ceoPipelineProgress);
  const nested = objectRecord(readNestedMetadata(metadata).ceoPipelineProgress);
  const raw = Object.keys(top).length > 0 ? top : nested;
  const stage = raw.stage;
  const status = raw.status;
  if (typeof stage !== "string" || typeof status !== "string") return null;
  return {
    stage: stage as CeoPipelineProgressMetadata["stage"],
    status: status as CeoPipelineProgressMetadata["status"],
    correlationId: typeof raw.correlationId === "string" ? raw.correlationId : "",
    traceId: typeof raw.traceId === "string" ? raw.traceId : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function parseReplayDecision(
  metadata: Record<string, unknown> | null | undefined,
): ReplayDecisionView | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = objectRecord(metadata.replayDecision);
  const kind = raw.kind;
  if (typeof kind !== "string") return null;
  return {
    kind: kind as ReplayDecisionKindView,
    requiresUserConfirmation: raw.requiresUserConfirmation === true,
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
    rationale: Array.isArray(raw.rationale)
      ? raw.rationale.filter((x): x is string => typeof x === "string")
      : undefined,
  };
}

export function parseProcessingStatus(
  metadata: Record<string, unknown> | null | undefined,
): ProcessingStatusView | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = objectRecord(metadata.processingStatus);
  if (Object.keys(raw).length === 0) return null;
  return {
    stage: typeof raw.stage === "string" ? raw.stage : undefined,
    mode: typeof raw.mode === "string" ? raw.mode : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    taskIntentCandidateId:
      typeof raw.taskIntentCandidateId === "string" ? raw.taskIntentCandidateId : undefined,
  };
}

export type ExplicitTaskSpecView = {
  title?: string;
  description?: string;
  expectedOutput?: string;
  dueDate?: string;
  assigneeType?: "unassigned" | "agent" | "organization_node";
  assigneeId?: string;
  acceptanceCriteria?: string[];
};

export function readExplicitTaskSpec(
  metadata: Record<string, unknown> | null | undefined,
): ExplicitTaskSpecView {
  if (!metadata || typeof metadata !== "object") return {};
  const raw = metadata.taskSpecDraft ?? metadata.taskSpec;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: ExplicitTaskSpecView = {};
  if (typeof obj.title === "string" && obj.title.trim()) out.title = obj.title.trim();
  if (typeof obj.description === "string" && obj.description.trim()) out.description = obj.description.trim();
  if (typeof obj.expectedOutput === "string" && obj.expectedOutput.trim()) {
    out.expectedOutput = obj.expectedOutput.trim();
  }
  if (typeof obj.dueDate === "string" && obj.dueDate.trim()) out.dueDate = obj.dueDate.trim();
  if (obj.assigneeType === "agent" || obj.assigneeType === "organization_node" || obj.assigneeType === "unassigned") {
    out.assigneeType = obj.assigneeType;
  }
  if (typeof obj.assigneeId === "string" && obj.assigneeId.trim()) out.assigneeId = obj.assigneeId.trim();
  if (Array.isArray(obj.acceptanceCriteria)) {
    const criteria = obj.acceptanceCriteria.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (criteria.length) out.acceptanceCriteria = criteria;
  }
  return out;
}

export function messageHasReplaySsotSignals(metadata: Record<string, unknown> | null | undefined): boolean {
  return Boolean(
    parseCeoAlignment(metadata) ||
      parseReplayDecision(metadata) ||
      parseCeoPipelineProgress(metadata) ||
      parseProcessingStatus(metadata)?.stage === "execution_intake",
  );
}

export type LatestAlignmentContext = {
  messageId: string;
  alignment: CeoAlignmentMetadata;
  replayDecision: ReplayDecisionView | null;
};

export function findLatestAlignmentContext(
  messages: Array<{ id: string; metadata?: Record<string, unknown> | null | undefined }>,
): LatestAlignmentContext | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    const alignment = parseCeoAlignment(m.metadata ?? null);
    if (!alignment) continue;
    if (alignment.phase === "idle" || alignment.phase === "replied") continue;
    return {
      messageId: m.id,
      alignment,
      replayDecision: parseReplayDecision(m.metadata ?? null),
    };
  }
  return null;
}

export function alignmentPhaseLabel(phase: CeoAlignmentPhase): string {
  switch (phase) {
    case "aligning":
      return "对齐中";
    case "awaiting_execution_confirm":
      return "等待执行确认";
    case "authorized":
      return "已授权执行";
    case "executing":
      return "执行中";
    case "replied":
      return "已回复";
    default:
      return "空闲";
  }
}

export function pipelineStageLabel(stage: CeoPipelineProgressMetadata["stage"]): string {
  switch (stage) {
    case "strategy":
      return "战略规划";
    case "orchestration":
      return "部门编排";
    case "supervision":
      return "执行监督";
    case "dispatch_plan":
      return "下发计划";
    case "dispatch_plan_flush":
      return "计划已下发，部门执行中";
    case "replay_propose":
      return "等待你确认执行";
    case "replay_light":
      return "已回复";
    case "replay_authorized":
      return "已授权，编排启动中";
    case "dept_executing":
      return "部门执行中";
    case "program_complete":
      return "全案监督收口";
    default:
      return stage;
  }
}

export function shouldShowCeoAlignmentCard(
  alignment: CeoAlignmentMetadata | null,
  replayDecision: ReplayDecisionView | null,
): boolean {
  if (!alignment) {
    return replayDecision?.kind === "propose_execution";
  }
  if (alignment.executionIntentDetected && alignment.suggestedCollaborationMode === "execution") {
    return true;
  }
  if (alignment.phase === "awaiting_execution_confirm") return true;
  if (alignment.phase === "aligning" && Boolean(alignment.draftGoalSummary?.trim())) return true;
  if (alignment.phase === "authorized" || alignment.phase === "executing") return true;
  if (replayDecision?.kind === "propose_execution") return true;
  return false;
}
