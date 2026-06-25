import type {
  CollaborationMessage,
  CollaborationRoom,
  CollaborationRoomCollaborationMode,
  MainRoomDraftState,
} from "@/features/collaboration/chats/api/collaborationApi";
import type { StrategyGoalDraftCardModel, StrategyPhaseRow } from "../components/StrategyGoalDraftCard";
import type { DistributionDraftRow } from "../components/DistributionDraftTable";
import { isMockApiEnabled } from "@/shared/config/env";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChatRoomListItem = {
  id: string;
  kind: "main" | "department" | "direct";
  title: string;
  subtitle?: string;
  roomType?: string;
  unreadCount?: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  collaborationMode?: CollaborationRoomCollaborationMode;
  directAgentId?: string;
};

export type TaskSummary = {
  id: string;
  title: string;
  owner: string;
  progress: number; // 0..100
  status: "not_started" | "in_progress" | "blocked" | "done";
  children?: TaskSummary[];
};

export type PendingApprovalCard = {
  approvalId: string;
  content: string;
  requester: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  sourceMessageId: string;
};

export type ApprovalResumeRichCard = {
  kind?: string;
  cardType?: string;
  routePath?: string | null;
  goal?: string | null;
  planId?: string | null;
  workflowId?: string | null;
  distributionTaskCount?: number;
  executionMode?: "temporal" | "inline" | string;
};

export type RichCardQuickAction = {
  actionId: string;
  label: string;
  sendText: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

/** 连接已建立但网关尚未写完 `client.data` 时可能短暂出现，不应污染 UI */
export const WS_TRANSIENT_AUTH_ERRORS = new Set([
  "缺少上下文或 roomId",
  "缺少 companyId",
  "missing companyId or userId",
]);

/** 与 Worker `emitStrategyGoalDraftSurfaceReply` 一致；元数据被历史白名单剥离时仍可提供快捷操作 */
export const DEFAULT_STRATEGY_GOAL_DRAFT_ACTIONS: RichCardQuickAction[] = [
  { actionId: "strategy_goal_finalize", label: "确认并开始部门编排", sendText: "定稿" },
  { actionId: "strategy_goal_revise", label: "我想改交付计划", sendText: "我想调整交付蓝图草稿" },
];

/** HTTP 会话草稿侧栏占位：不与真实消息 id 冲突 */
export const HTTP_MAIN_ROOM_STRATEGY_DRAFT_PLACEHOLDER_ID = "__main_room_strategy_draft_http__";

// ─── Pure Functions ──────────────────────────────────────────────────────────

/** [MOCK] 网关用 mock JWT 连接 WS 时的噪声，不展示在输入框上方 */
export function isMockWsAuthNoise(text: string): boolean {
  if (!isMockApiEnabled()) return false;
  const lower = text.trim().toLowerCase();
  return (
    lower.includes("jwt malformed") ||
    lower.includes("invalid token") ||
    lower.includes("jsonwebtokenerror") ||
    lower === "unauthorized"
  );
}

export function normalizeCollaborationRooms(rows: CollaborationRoom[]): ChatRoomListItem[] {
  return rows.map((row) => {
    const isMain = row.roomType === "main";
    const isDirect = row.roomType === "direct";
    const kind = isMain ? "main" : isDirect ? "direct" : "department";
    const meta = (row as Record<string, unknown>).metadata as Record<string, unknown> | undefined;
    const directAgentId = isDirect && meta ? (meta.directAgentId as string | undefined) : undefined;
    return {
      id: row.id,
      kind,
      roomType: row.roomType,
      unreadCount: row.unreadCount ?? 0,
      lastMessage: row.lastMessage ?? null,
      lastMessageAt: row.lastMessageAt ?? null,
      title: isMain ? "主群聊" : isDirect ? (row.name || "私聊") : row.name || "部门群聊",
      subtitle: isMain ? "CEO + 各部门主管" : isDirect ? "私聊" : "部门主管 + 员工",
      collaborationMode: row.collaborationMode,
      directAgentId,
    };
  });
}

export function sortCollaborationRooms(rows: ChatRoomListItem[]): ChatRoomListItem[] {
  const main = rows.filter((r) => r.kind === "main");
  const departments = rows.filter((r) => r.kind === "department");
  const directs = rows.filter((r) => r.kind === "direct");
  return [...main, ...departments, ...directs];
}

/** Worker：`lightStructuredOutputV2.metadata.richCard` 或顶层 `metadata.richCard`（同 cardType） */
export function getStrategyGoalDraftRichCardRaw(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const top = metadata.richCard as Record<string, unknown> | undefined;
  if (top && typeof top === "object" && String(top.cardType ?? "").trim() === "strategy_goal_draft") {
    return top;
  }
  const ls = metadata.lightStructuredOutputV2 as Record<string, unknown> | undefined;
  const inner =
    ls && typeof ls === "object" && ls.metadata && typeof ls.metadata === "object"
      ? (ls.metadata as Record<string, unknown>)
      : null;
  const richCard = inner?.richCard as Record<string, unknown> | undefined;
  if (!richCard || typeof richCard !== "object") return null;
  if (String(richCard.cardType ?? "").trim() !== "strategy_goal_draft") return null;
  return richCard;
}

export function extractStrategyGoalDraftCard(
  metadata: Record<string, unknown> | null | undefined,
): StrategyGoalDraftCardModel | null {
  const richCard = getStrategyGoalDraftRichCardRaw(metadata);
  if (!richCard) return null;
  const strategyGoal = String(richCard.strategyGoal ?? "").trim();
  if (!strategyGoal) return null;
  const planId = typeof richCard.planId === "string" ? richCard.planId.trim() : undefined;
  const mainGoalTaskId =
    typeof richCard.mainGoalTaskId === "string" && richCard.mainGoalTaskId.trim()
      ? richCard.mainGoalTaskId.trim()
      : undefined;
  const rawPhases = richCard.strategicPhases;
  const strategicPhases: StrategyPhaseRow[] = [];
  if (Array.isArray(rawPhases)) {
    for (const item of rawPhases.slice(0, 12)) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const title = String(o.title ?? o.name ?? "").trim();
      const outcome = String(o.outcome ?? o.target ?? "").trim();
      if (!title && !outcome) continue;
      strategicPhases.push({
        phaseId: typeof o.phaseId === "string" && o.phaseId.trim() ? o.phaseId.trim() : undefined,
        title: title || "—",
        outcome: outcome || "—",
        deadline: typeof o.deadline === "string" && o.deadline.trim() ? o.deadline.trim() : undefined,
      });
    }
  }
  if (!strategicPhases.length && Array.isArray(richCard.keyResults)) {
    for (const item of (richCard.keyResults as unknown[]).slice(0, 12)) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      strategicPhases.push({
        title: String(o.name ?? "").trim() || "—",
        outcome: String(o.target ?? "").trim() || "—",
        deadline: typeof o.deadline === "string" && o.deadline.trim() ? o.deadline.trim() : undefined,
      });
    }
  }
  return { strategyGoal, planId, mainGoalTaskId, strategicPhases };
}

/** 历史消息若丢失 metadata，从正文解析（新模板「主目标/阶段性成果」或旧模板） */
export function parseStrategyGoalDraftFromMessageContent(content: string): StrategyGoalDraftCardModel | null {
  const hasNew = content.includes("【主目标】");
  const hasOldGoal = content.includes("【目标】");
  if (!hasNew && !hasOldGoal) return null;

  let strategyGoal = "";
  let phaseBlock = "";
  if (hasNew) {
    const parts = content.split(/\n\n【阶段性成果】/);
    const head = parts[0] ?? "";
    const goalMatch = head.match(/【主目标】\s*\n([\s\S]*)$/);
    strategyGoal = (goalMatch?.[1] ?? "").trim();
    phaseBlock = parts.length > 1 ? (parts[1] ?? "").split(/\n\n回复/)[0].split(/\n\n【/)[0].trim() : "";
  } else {
    if (!/战略目标草稿/.test(content) && !/请确认后下发编排/.test(content)) return null;
    const parts = content.split(/\n\n【关键结果】/);
    const head = parts[0] ?? "";
    const goalMatch = head.match(/【目标】\s*\n([\s\S]*)$/);
    strategyGoal = (goalMatch?.[1] ?? "").trim();
    phaseBlock = parts.length > 1 ? (parts[1] ?? "").split(/\n\n请回复/)[0].split(/\n\n【/)[0].trim() : "";
  }
  const strategicPhases: StrategyPhaseRow[] = [];
  for (const line of phaseBlock.split("\n")) {
    const t = line.trim();
    if (!t || /暂无结构化/.test(t)) continue;
    const m = t.match(/^•\s*(.+?)[：:]\s*(.+)$/);
    if (m) {
      strategicPhases.push({ title: m[1].trim() || "—", outcome: m[2].trim() || "—" });
    }
  }
  if (!strategyGoal) return null;
  return { strategyGoal, planId: undefined, mainGoalTaskId: undefined, strategicPhases };
}

export function pickLegacyPlanningFields(raw: unknown): {
  goal?: string;
  planId?: string;
  strategicPhases?: Array<{ phaseId?: unknown; title?: unknown; name?: unknown; outcome?: unknown; target?: unknown; deadline?: unknown }>;
  okrs?: Array<{ name?: unknown; target?: unknown; deadline?: unknown }>;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const goal = typeof o.goal === "string" ? o.goal.trim() : "";
  const planId = typeof o.planId === "string" ? o.planId.trim() : "";
  const strategicPhases = Array.isArray(o.strategicPhases) ? (o.strategicPhases as Array<Record<string, unknown>>) : [];
  const okrs = Array.isArray(o.okrs) ? (o.okrs as Array<Record<string, unknown>>) : [];
  return {
    ...(goal ? { goal } : {}),
    ...(planId ? { planId } : {}),
    ...(strategicPhases.length ? { strategicPhases } : {}),
    ...(okrs.length ? { okrs } : {}),
  };
}

/**
 * 从 `MainRoomDraftState` 构建侧栏/摘要用展示模型。
 * **单一真源**：优先 `planning2026` + `legacyPlanning`（与 Worker 写入 Redis 的会话一致）；`planning2026` 缺失时仍可用 legacy 蓝图。
 */
export function buildStrategyDisplayModelFromMainRoomDraft(s: MainRoomDraftState): StrategyGoalDraftCardModel | null {
  const p = s.planning2026 as Record<string, unknown> | null | undefined;
  const legacy = pickLegacyPlanningFields(s.legacyPlanning);
  const goal26 = p ? String(p.strategyGoal ?? "").trim() : "";
  const goal = goal26 || String(legacy.goal ?? "").trim();
  if (!goal) return null;

  const mapPhase = (k: { title: string; outcome: string; deadline?: string; phaseId?: string }) => ({
    ...(k.phaseId ? { phaseId: k.phaseId } : {}),
    title: String(k.title ?? "").trim() || "—",
    outcome: String(k.outcome ?? "").trim() || "—",
    deadline: typeof k.deadline === "string" && k.deadline.trim() ? k.deadline.trim() : undefined,
  });
  const phases26 =
    p && Array.isArray(p.strategicPhases)
      ? (p.strategicPhases as Array<Record<string, unknown>>).map((x, i) =>
          mapPhase({
            phaseId: typeof x.phaseId === "string" ? x.phaseId : undefined,
            title: String(x.title ?? x.name ?? "").trim() || `阶段 ${i + 1}`,
            outcome: String(x.outcome ?? x.target ?? "").trim() || "—",
            deadline: typeof x.deadline === "string" ? x.deadline : undefined,
          }),
        )
      : p && Array.isArray(p.keyResults)
        ? (p.keyResults as Array<Record<string, unknown>>).map((x, i) =>
            mapPhase({
              title: String(x.name ?? "").trim() || `阶段 ${i + 1}`,
              outcome: String(x.target ?? "").trim() || "—",
              deadline: typeof x.deadline === "string" ? x.deadline : undefined,
            }),
          )
        : [];
  const phasesLegacy =
    legacy.strategicPhases?.map((x, i) =>
      mapPhase({
        phaseId: typeof x?.phaseId === "string" ? String(x.phaseId) : undefined,
        title: String(x?.title ?? x?.name ?? "").trim() || `阶段 ${i + 1}`,
        outcome: String(x?.outcome ?? x?.target ?? "").trim() || "—",
        deadline: typeof x?.deadline === "string" ? String(x.deadline) : undefined,
      }),
    ) ??
    legacy.okrs?.map((k, i) =>
      mapPhase({
        title: String(k?.name ?? "").trim() || `阶段 ${i + 1}`,
        outcome: String(k?.target ?? "").trim() || "—",
        deadline:
          typeof k?.deadline === "string" && String(k.deadline).trim()
            ? String(k.deadline).trim()
            : undefined,
      }),
    ) ??
    [];
  const strategicPhases = phases26.length > 0 ? phases26 : phasesLegacy;

  const planIdDisplay =
    (legacy.planId && legacy.planId) || (typeof s.planId === "string" && s.planId.trim()) || undefined;
  const mainGoalTaskId =
    typeof s.mainGoalTaskId === "string" && s.mainGoalTaskId.trim() ? s.mainGoalTaskId.trim() : undefined;

  return {
    strategyGoal: goal,
    ...(planIdDisplay ? { planId: planIdDisplay } : {}),
    ...(mainGoalTaskId ? { mainGoalTaskId } : {}),
    strategicPhases,
  };
}

export function extractAnchoredStrategyDraftFromMessages(
  anchorId: string | null | undefined,
  messages: CollaborationMessage[],
): StrategyGoalDraftCardModel | null {
  const id = typeof anchorId === "string" ? anchorId.trim() : "";
  if (!id) return null;
  const m = messages.find((x) => x.id === id);
  if (!m || m.senderType !== "agent") return null;
  const meta = m.metadata && typeof m.metadata === "object" ? m.metadata : null;
  const fromMeta = extractStrategyGoalDraftCard(meta as Record<string, unknown>);
  if (fromMeta) return fromMeta;
  return parseStrategyGoalDraftFromMessageContent(typeof m.content === "string" ? m.content : "");
}

/**
 * 交付蓝图展示：**Redis/HTTP 会话为真源**；仅当会话无法构造模型时，才用锚定消息（富卡片或正文）回退。
 * 避免「用户 PATCH 会话后群内旧卡片与侧栏不一致」——PATCH 只更新 Redis，不反写历史消息 metadata。
 */
export function resolveStrategyGoalDisplayFromMainRoomState(params: {
  s: MainRoomDraftState;
  mainCollaborationRoomId: string;
  visibleMessages: CollaborationMessage[];
}): StrategyGoalDraftCardModel | null {
  const { s, mainCollaborationRoomId, visibleMessages } = params;
  if (!s?.hasSession || !mainCollaborationRoomId) return null;
  const fromSession = buildStrategyDisplayModelFromMainRoomDraft(s);
  if (fromSession) return fromSession;
  return extractAnchoredStrategyDraftFromMessages(s.sourceStrategyMessageId, visibleMessages);
}

/** Worker：`cardType: strategy_goal_draft`（定稿并下发 / 继续修改） */
export function extractStrategyGoalDraftActions(
  metadata: Record<string, unknown> | null | undefined,
): RichCardQuickAction[] | null {
  const richCard = getStrategyGoalDraftRichCardRaw(metadata);
  if (!richCard) return null;
  const raw = richCard.actions;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RichCardQuickAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const sendText = String(o.sendText ?? "").trim();
    const label = String(o.label ?? "").trim();
    const actionId = String(o.actionId ?? "").trim();
    if (!sendText || !label) continue;
    out.push({ actionId: actionId || sendText, label, sendText });
  }
  return out.length ? out : null;
}

/** CEO v2 消息落地后应刷新侧边目标/任务树（与 Worker distribution / supervision 对齐）。 */
export function agentMessageShouldRefreshGoalCards(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const kind = String(metadata.kind ?? "");
  if (kind === "main_room_dept_dispatch" || metadata.mainRoomDeptDispatch === true) return true;
  if (kind === "main_room_wave_supervision_nudge") return true;
  if (kind === "main_room_distribution_completion_summary") return true;
  if (String(metadata.source ?? "") !== "ceo_v2") return false;
  const dc = typeof metadata.distributionCount === "number" ? metadata.distributionCount : 0;
  if (dc > 0) return true;
  if (metadata.distributionDraft && typeof metadata.distributionDraft === "object") return true;
  const fr = String(metadata.fastReplySource ?? "");
  if (/main_room_distribution_dispatch|supervision_inline|strategy_goal_already_orchestrated/i.test(fr)) return true;
  return false;
}

export function placeholderStrategyDraftMessage(roomId: string): CollaborationMessage {
  return {
    id: HTTP_MAIN_ROOM_STRATEGY_DRAFT_PLACEHOLDER_ID,
    roomId,
    senderType: "agent",
    senderId: "ceo-session",
    messageType: "text",
    content: "",
    createdAt: new Date(0).toISOString(),
    metadata: {},
  };
}

/** 消息 metadata 中的 `distributionDraft`（appendAgent 落库；不强制 source，便于网关字段微调）。 */
export function extractCeoV2DistributionDraft(metadata: Record<string, unknown> | null): DistributionDraftRow[] | null {
  if (!metadata) return null;
  const d = metadata.distributionDraft;
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const rowsRaw = o.rows;
  if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) return null;
  const rows: DistributionDraftRow[] = [];
  for (const row of rowsRaw.slice(0, 24)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    rows.push({
      department: String(r.department ?? "").trim() || "—",
      priority: String(r.priority ?? "").trim() || "—",
      deliverable: String(r.deliverable ?? "").trim() || "—",
    });
  }
  return rows.length ? rows : null;
}

/**
 * 当历史消息在 RPC 白名单剥离中丢失 `distributionDraft` 时，从 CEO 正文中解析
 * `formatDistributionPlanDraftForMainRoom` 生成的行（与 Worker 格式一致；兼容旧版标题）。
 */
export function extractDistributionDraftFromMessageContent(content: string): DistributionDraftRow[] | null {
  const markers = [
    "【任务拆分卡（编排草案，确认后按依赖顺序下发部门）】",
    "【编排草案：各部门子任务】",
  ] as const;
  let rest = "";
  for (const marker of markers) {
    const i = content.indexOf(marker);
    if (i !== -1) {
      rest = content.slice(i + marker.length);
      break;
    }
  }
  if (!rest) return null;
  const stop = rest.search(/\n\n【/);
  const block = (stop === -1 ? rest : rest.slice(0, stop)).trim();
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows: DistributionDraftRow[] = [];
  const re =
    /^•\s*\d+\.\s*部门「([^」]*)」(?: · 需前置任务完成后派发| · 无前置依赖)?：(.+)（优先级\s*([^）]+)）\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      rows.push({
        department: m[1].trim() || "—",
        deliverable: m[2].trim(),
        priority: m[3].trim(),
      });
    }
  }
  return rows.length ? rows : null;
}
