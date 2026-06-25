/**
 * 主群 Collaboration Program SSOT — Worker / API / Client 共用。
 */

import type { CeoAlignmentMetadata } from './ceo-alignment.js';
import type { OrchestrationRunLifecycle } from './orchestration-lifecycle.js';

export type CollaborationProgramPhase =
  | 'idle'
  | 'intake'
  | 'aligning'
  | 'ready_to_plan'
  | 'planning'
  | 'pending_confirm'
  | 'dispatching'
  | 'dept_executing'
  | 'supervising'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export type ProgramTurnKind =
  | 'deliverable_intake'
  | 'fill_brief'
  | 'confirm'
  | 'complaint_gap'
  | 'consult_director'
  | 'cancel'
  | 'chat_only'
  | 'revise_scope';

export type CollaborationProgramConfirmMode = 'auto' | 'always';

export interface DeliverableBrief {
  deliverableType: string;
  title?: string | null;
  audience?: string | null;
  timeframe?: string | null;
  persona?: string | null;
  purpose?: string | null;
  completeness: number;
  missingFields: string[];
}

/** 模型理解的任务目标（Dispatch Plan SSOT 主输入） */
export interface GoalUnderstanding {
  summary: string;
  deliverableKind?: string | null;
  aspects?: Record<string, string>;
  readiness: 'ready' | 'needs_clarification';
  clarifyQuestion?: string | null;
  confidence?: number;
  updatedAt?: string;
  source: 'llm_turn' | 'user_edit' | 'fallback_regex';
}

export interface CollaborationProgramDispatchState {
  planRevision?: number | null;
  pendingDistributionConfirm?: boolean;
  mainGoalTaskId?: string | null;
}

export type ProgramTimelineEventKind =
  | 'user_message'
  | 'ceo_reply'
  | 'work_command'
  | 'plan_generated'
  | 'dispatch_flushed'
  | 'dept_ack'
  | 'employee_report'
  | 'qc_rework'
  | 'supervision_complete'
  | 'compensation'
  | 'paused'
  | 'failed';

/**
 * Program 时间线事件（主群生命周期 SSOT 的“可读日志”）。
 *
 * 注意：当前实现采用 Redis list 存储，不直接落 DB；因此不挂到 CollaborationProgramRecord 上，
 * 避免实体/迁移膨胀。API/Client 需要时再按 programId 拉取。
 */
export interface ProgramTimelineEvent {
  id: string;
  at: string;
  phase: CollaborationProgramPhase;
  kind: ProgramTimelineEventKind;
  summary: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface CollaborationProgramRecord {
  id: string;
  companyId: string;
  roomId: string;
  threadId: string;
  sourceMessageId: string;
  phase: CollaborationProgramPhase;
  brief: DeliverableBrief;
  goalUnderstanding?: GoalUnderstanding | null;
  parentGoalTaskId?: string | null;
  dispatch?: CollaborationProgramDispatchState | null;
  alignment?: CeoAlignmentMetadata | null;
  lifecycle: OrchestrationRunLifecycle;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export const COLLABORATION_PROGRAM_PHASE_LABELS: Record<CollaborationProgramPhase, string> = {
  idle: '空闲',
  intake: '接收诉求',
  aligning: '参数对齐中',
  ready_to_plan: '待生成计划',
  planning: '编排规划中',
  pending_confirm: '等待确认下发',
  dispatching: '正在派发',
  dept_executing: '部门执行中',
  supervising: '监督收口',
  delivered: '已交付',
  failed: '失败',
  cancelled: '已取消',
};

export const OPEN_PROGRAM_PHASES: ReadonlySet<CollaborationProgramPhase> = new Set([
  'intake',
  'aligning',
  'ready_to_plan',
  'planning',
  'pending_confirm',
  'dispatching',
  'dept_executing',
  'supervising',
]);

export const TERMINAL_PROGRAM_PHASES: ReadonlySet<CollaborationProgramPhase> = new Set([
  'delivered',
  'failed',
  'cancelled',
  'idle',
]);

/** analysis_report 类交付物默认必填字段 */
export const DEFAULT_BRIEF_REQUIRED_FIELDS = ['audience', 'timeframe', 'persona', 'purpose'] as const;

export function emptyDeliverableBrief(deliverableType = 'deliverable'): DeliverableBrief {
  return {
    deliverableType,
    title: null,
    audience: null,
    timeframe: null,
    persona: null,
    purpose: null,
    completeness: 0,
    missingFields: [...DEFAULT_BRIEF_REQUIRED_FIELDS],
  };
}

export function computeBriefCompleteness(
  brief: Pick<DeliverableBrief, 'audience' | 'timeframe' | 'persona' | 'purpose'>,
  requiredFields: readonly string[] = DEFAULT_BRIEF_REQUIRED_FIELDS,
): { completeness: number; missingFields: string[] } {
  const missingFields: string[] = [];
  for (const field of requiredFields) {
    const val = String((brief as Record<string, unknown>)[field] ?? '').trim();
    if (!val) missingFields.push(field);
  }
  const completeness =
    requiredFields.length === 0 ? 1 : (requiredFields.length - missingFields.length) / requiredFields.length;
  return { completeness, missingFields };
}

export function mergeDeliverableBrief(
  base: DeliverableBrief,
  patch: Partial<DeliverableBrief>,
): DeliverableBrief {
  const merged: DeliverableBrief = {
    ...base,
    deliverableType: String(patch.deliverableType ?? base.deliverableType ?? 'deliverable').trim() || 'deliverable',
    title: patch.title !== undefined ? patch.title : base.title,
    audience: patch.audience !== undefined ? patch.audience : base.audience,
    timeframe: patch.timeframe !== undefined ? patch.timeframe : base.timeframe,
    persona: patch.persona !== undefined ? patch.persona : base.persona,
    purpose: patch.purpose !== undefined ? patch.purpose : base.purpose,
    completeness: base.completeness,
    missingFields: base.missingFields,
  };
  const { completeness, missingFields } = computeBriefCompleteness(merged);
  return { ...merged, completeness, missingFields };
}

export function isProgramPhaseOpen(phase: CollaborationProgramPhase): boolean {
  return OPEN_PROGRAM_PHASES.has(phase);
}

export function programPhaseToCollaborationMode(
  phase: CollaborationProgramPhase,
): 'discussion' | 'execution' | 'approval_wait' {
  if (phase === 'dept_executing' || phase === 'dispatching' || phase === 'supervising') {
    return 'execution';
  }
  if (phase === 'pending_confirm') {
    return 'approval_wait';
  }
  return 'discussion';
}

export function programPhaseToLifecycle(phase: CollaborationProgramPhase): OrchestrationRunLifecycle {
  switch (phase) {
    case 'idle':
    case 'intake':
    case 'aligning':
    case 'ready_to_plan':
    case 'pending_confirm':
      return 'awaiting_confirm';
    case 'planning':
      return 'planning';
    case 'dispatching':
      return 'dispatching';
    case 'dept_executing':
      return 'dept_executing';
    case 'supervising':
      return 'supervising';
    case 'delivered':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'skipped';
    default:
      return 'planning';
  }
}

export function programPhaseLabel(phase: CollaborationProgramPhase | string | null | undefined): string {
  const p = String(phase ?? '').trim() as CollaborationProgramPhase;
  if (p && p in COLLABORATION_PROGRAM_PHASE_LABELS) {
    return COLLABORATION_PROGRAM_PHASE_LABELS[p];
  }
  return '处理中';
}

export function nextPhaseAfterBriefComplete(
  confirmMode: CollaborationProgramConfirmMode,
): CollaborationProgramPhase {
  return confirmMode === 'always' ? 'pending_confirm' : 'ready_to_plan';
}

export function canTransitionProgramPhase(
  from: CollaborationProgramPhase,
  to: CollaborationProgramPhase,
): boolean {
  if (from === to) return true;
  const allowed: Record<CollaborationProgramPhase, CollaborationProgramPhase[]> = {
    idle: ['intake', 'aligning', 'cancelled'],
    intake: ['aligning', 'ready_to_plan', 'pending_confirm', 'planning', 'cancelled', 'failed'],
    aligning: ['aligning', 'ready_to_plan', 'pending_confirm', 'planning', 'cancelled', 'failed'],
    ready_to_plan: ['planning', 'pending_confirm', 'cancelled', 'failed'],
    planning: ['dispatching', 'pending_confirm', 'failed', 'aligning'],
    pending_confirm: ['planning', 'dispatching', 'cancelled', 'aligning'],
    dispatching: ['dept_executing', 'failed'],
    dept_executing: ['supervising', 'delivered', 'failed', 'aligning'],
    supervising: ['delivered', 'failed'],
    delivered: [],
    failed: ['aligning', 'intake', 'cancelled'],
    cancelled: [],
  };
  return (allowed[from] ?? []).includes(to);
}

export function serializeCollaborationProgram(row: CollaborationProgramRecord): CollaborationProgramRecord {
  return {
    ...row,
    lifecycle: programPhaseToLifecycle(row.phase),
  };
}
