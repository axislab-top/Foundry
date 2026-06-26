/**
 * 轻量启发式路由标签（Director/Employee 自主路径中的本地分支，无独立 LLM 路由服务）。
 * 不含 LLM、不含记忆 RPC；仅用于自主协作子系统的 path/confidence 元数据。
 */
export type AutonomousIntentPath = 'quick' | 'heavy' | 'director' | 'graph' | 'autonomous';

export type AutonomousIntentRoute = {
  path: AutonomousIntentPath;
  confidence: number;
  subGraph?: unknown;
};

/** Director/Employee 自主启发式路由的最小输入。 */
export type AutonomousRouterInput = {
  companyId: string;
  roomId: string;
  messageId: string;
  contentText: string;
  threadId?: string | null;
  mentionedAgentIds?: string[];
  mentionedNodeIds?: string[];
  ceoAgentId: string | null;
  humanSenderId?: string | null;
  clientFeatureFlags?: string[];
};

/** Phase 3.5：单职务启发式 + Intent 置信度门控（主群直连 handover 观测）。 */
export function isDirectSingleAgentHandover(input: { requestedRoles: string[]; confidence: number }): boolean {
  return input.requestedRoles.length === 1 && input.confidence > 0.85;
}

/** 部门 Director 自主：原 `resolveRoute` 在 Predictive 关闭时的启发式。 */
export function resolveDirectorAutonomousRoute(input: AutonomousRouterInput): AutonomousIntentRoute {
  const mentions = input.mentionedAgentIds ?? [];
  if (mentions.length > 0) {
    return { path: 'director', confidence: 0.72 };
  }
  const t = String(input.contentText ?? '');
  if (/委派|子任务|拆解|delegate|subtask/i.test(t)) {
    return { path: 'director', confidence: 0.62 };
  }
  if (t.length > 400) {
    return { path: 'heavy', confidence: 0.55 };
  }
  return { path: 'quick', confidence: 0.5 };
}

/** 员工 Agent 自主：原 `resolveRoute` 在 Predictive 关闭时的启发式。 */
export function resolveEmployeeAutonomousRoute(input: AutonomousRouterInput): AutonomousIntentRoute {
  const mentions = input.mentionedAgentIds ?? [];
  if (mentions.length > 0) {
    return { path: 'director', confidence: 0.71 };
  }
  const t = String(input.contentText ?? '');
  if (/子任务|提议|propose|委派|delegate/i.test(t)) {
    return { path: 'graph', confidence: 0.64 };
  }
  if (t.length > 400) {
    return { path: 'heavy', confidence: 0.56 };
  }
  return { path: 'quick', confidence: 0.5 };
}
