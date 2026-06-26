import type {
  CollaborationIntentDecisionV20261,
  CollaborationProgramRecord,
  DeliverableBrief,
  GoalUnderstanding,
} from '@contracts/types';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type { CollaborationPipelineV2RunInput } from '../pipeline-v2/collaboration-pipeline-v2.types.js';
import type { IntentDecision as CollaborationIntentDecision2026 } from '../contracts/collaboration-2026.contracts.js';

export type CollaborationTurnToolContext = {
  companyId: string;
  roomId: string;
  threadId: string | null;
  traceId: string;
  messageId: string;
  ceoAgentId: string;
  humanSenderId: string | null;
  input: CollaborationPipelineV2RunInput;
  roomContext: RoomContext;
  intentDecision2026: CollaborationIntentDecision2026;
  intentDecision2026_1: CollaborationIntentDecisionV20261;
  collaborationMode?: string | null;
  /** orchestrate 工具执行后的用户可见 ack（优先于模型原文） */
  dispatchFollowupAck?: string | null;
};

export type CollaborationOrchestrateToolResult = {
  ok: boolean;
  planId?: string | null;
  assignmentCount?: number;
  routePath?: string;
  error?: string;
};

export function briefPatchFromAspects(aspects?: Record<string, string> | null): Partial<DeliverableBrief> {
  if (!aspects || typeof aspects !== 'object') return {};
  const patch: Partial<DeliverableBrief> = {};
  const map: Array<[keyof DeliverableBrief, string[]]> = [
    ['audience', ['audience', '受众']],
    ['timeframe', ['timeframe', '时间范围', '周期']],
    ['persona', ['persona', '用户画像', '画像']],
    ['purpose', ['purpose', '目的', '核心目的']],
    ['title', ['title', '标题']],
    ['deliverableType', ['deliverableType', 'deliverable_kind', '交付类型']],
  ];
  for (const [field, keys] of map) {
    for (const key of keys) {
      const val = String(aspects[key] ?? '').trim();
      if (val) {
        (patch as Record<string, unknown>)[field as string] = val;
        break;
      }
    }
  }
  return patch;
}

export function buildGoalUnderstanding(params: {
  goalSummary: string;
  aspects?: Record<string, string> | null;
  deliverableKind?: string | null;
  readiness?: GoalUnderstanding['readiness'];
  clarifyQuestion?: string | null;
}): GoalUnderstanding {
  return {
    summary: params.goalSummary.trim().slice(0, 8000),
    deliverableKind: params.deliverableKind ?? null,
    aspects: params.aspects ?? undefined,
    readiness: params.readiness ?? 'ready',
    clarifyQuestion: params.clarifyQuestion ?? null,
    updatedAt: new Date().toISOString(),
    source: 'llm_turn',
  };
}

export function programBriefSummaryLine(program: CollaborationProgramRecord): string {
  const goal = String(program.goalUnderstanding?.summary ?? '').trim();
  if (goal) return goal.slice(0, 4000);
  const b = program.brief;
  const parts = [
    b.title,
    b.deliverableType,
    b.audience,
    b.timeframe,
    b.persona,
    b.purpose,
  ]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean);
  return parts.join(' · ').slice(0, 4000);
}

export function resolveGoalSummaryForOrchestrate(
  program: CollaborationProgramRecord | null,
): string | null {
  if (!program) return null;
  const fromGoal = String(program.goalUnderstanding?.summary ?? '').trim();
  if (fromGoal.length >= 8) return fromGoal.slice(0, 8000);
  const fromBrief = programBriefSummaryLine(program);
  if (fromBrief.length >= 8) return fromBrief.slice(0, 8000);
  return null;
}

export function shouldMechanicalOrchestrate(
  input: import('../pipeline-v2/collaboration-pipeline-v2.types.js').CollaborationPipelineV2RunInput,
  program: CollaborationProgramRecord | null,
): boolean {
  if (!program) return false;
  if (!resolveGoalSummaryForOrchestrate(program)) return false;
  if (input.userConfirmedExecution === true) return true;
  if (String(input.confirmationIntent ?? '').trim() === 'confirm_execution') return true;
  const t = String(input.contentText ?? '').trim().replace(/\s+/g, '');
  if (!t) return false;
  if (/^(确认执行|按上述目标直接编排下发)$/.test(t)) return true;
  if (t.length <= 48 && /按上述目标.*编排下发|确认执行/.test(t)) return true;
  return false;
}

export function sanitizeTurnUserSurfaceText(text: string): string {
  return String(text ?? '')
    .replace(/\*\*?\s*调用\s*collaboration\.\w+\s*\*\*?/gi, '')
    .replace(/调用\s*collaboration\.\w+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 未实际编排时，去掉 LLM 口头「已下发/已编排」等误导性表述。 */
export function stripFalseDispatchClaims(text: string, orchestrationRan: boolean): string {
  const t = sanitizeTurnUserSurfaceText(text);
  if (orchestrationRan || !t) return t;
  if (/已编排下发|已向各部门|执行计划已编排|计划卡片已生成|正在向各部门下发/.test(t)) {
    return '收到你的目标。请补充具体交付物与范围，或点 Program 面板「确认执行」，我会生成计划并派给各部门。';
  }
  return t;
}
