import type { MainRoomDispatchPlanState } from "../api/collaborationApi";
import type {
  DispatchPlanAssignmentRow,
  DispatchPlanDraftCardModel,
} from "../components/DispatchPlanDraftCard";
import {
  extractDispatchPlanDraftFromMetadata,
  normalizeDispatchPlanAssignment,
  parseDispatchPlanDraftFromMessageContent,
} from "./dispatchPlanDraft";

export type DispatchPlanQuickAction = {
  actionId: string;
  label: string;
  sendText: string;
};

export const DISPATCH_PLAN_EXECUTION_ORDER_LABELS: Record<string, string> = {
  parallel: "并行下发",
  sequential: "顺序执行",
  dag: "依赖图（DAG）",
};

export const DEFAULT_DISPATCH_PLAN_QUICK_ACTIONS: DispatchPlanQuickAction[] = [
  { actionId: "dispatch_plan_confirm_flush", label: "确认并下发部门", sendText: "确认下发" },
  { actionId: "dispatch_plan_revise", label: "修订执行计划", sendText: "我想调整执行计划" },
];

export function mapDispatchPlanQuickActionsFromApi(
  raw: MainRoomDispatchPlanState["dispatchPlanDraftQuickActions"] | undefined,
): DispatchPlanQuickAction[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .map((a) => ({
      actionId: String(a.actionId ?? "").trim(),
      label: String(a.label ?? "").trim(),
      sendText: String(a.sendText ?? "").trim(),
    }))
    .filter((a) => a.label && a.sendText);
}

/** 已下发或锚定到其他消息时，不在气泡上展示快捷操作 */
export function shouldShowDispatchPlanQuickActions(params: {
  card: DispatchPlanDraftCardModel;
  dispatchPlanDraftState: MainRoomDispatchPlanState | null;
  messageId?: string;
}): boolean {
  if (params.card.dispatched) return false;
  if (params.dispatchPlanDraftState?.dispatched) return false;
  const anchor = params.dispatchPlanDraftState?.sourceMessageId?.trim();
  if (anchor && params.messageId) return params.messageId === anchor;
  return true;
}

export function resolveDispatchPlanQuickActions(params: {
  card: DispatchPlanDraftCardModel | null;
  dispatchPlanDraftState: MainRoomDispatchPlanState | null;
}): DispatchPlanQuickAction[] {
  if (!params.card) return [];
  if (params.card.dispatched || params.dispatchPlanDraftState?.dispatched) return [];
  const fromApi = mapDispatchPlanQuickActionsFromApi(params.dispatchPlanDraftState?.dispatchPlanDraftQuickActions);
  if (fromApi.length) return fromApi;
  return [...DEFAULT_DISPATCH_PLAN_QUICK_ACTIONS];
}

export function buildDispatchPlanCardFromHttpState(
  s: MainRoomDispatchPlanState,
): DispatchPlanDraftCardModel | null {
  if (!s.hasSession || !s.goal?.trim()) return null;
  const assignments = Array.isArray(s.assignments)
    ? s.assignments
        .map((a) => normalizeDispatchPlanAssignment(a))
        .filter((a): a is DispatchPlanAssignmentRow => a !== null)
    : [];
  if (!assignments.length) return null;
  return {
    goal: s.goal.trim(),
    planId: s.planId ?? undefined,
    planRevision: s.planRevision ?? undefined,
    executionOrder: s.executionOrder ?? undefined,
    assignments,
    pendingConfirm: s.pendingDistributionConfirm === true,
    dispatched: s.dispatched === true,
  };
}

export function resolveLatestDispatchPlanDraft(params: {
  dispatchPlanDraftState: MainRoomDispatchPlanState | null;
  visibleMessages: Array<{ id: string; senderType?: string; content?: string; metadata?: unknown }>;
}): { model: DispatchPlanDraftCardModel; fromMetadata: boolean; messageId?: string } | null {
  const { dispatchPlanDraftState: s } = params;
  if (s?.hasSession && !s.dispatched) {
    const fromHttp = buildDispatchPlanCardFromHttpState(s);
    if (fromHttp) {
      return {
        model: fromHttp,
        fromMetadata: true,
        messageId: s.sourceMessageId?.trim() || undefined,
      };
    }
  }
  for (let i = params.visibleMessages.length - 1; i >= 0; i--) {
    const m = params.visibleMessages[i];
    if (m.senderType !== "agent") continue;
    const meta = m.metadata && typeof m.metadata === "object" ? (m.metadata as Record<string, unknown>) : null;
    const fromMeta = extractDispatchPlanDraftFromMetadata(meta);
    const fromParsed = fromMeta ? null : parseDispatchPlanDraftFromMessageContent(String(m.content ?? ""));
    const model = fromMeta ?? fromParsed;
    if (model) return { model, fromMetadata: Boolean(fromMeta), messageId: m.id };
  }
  return null;
}
