/**
 * 2026.1 前置意图统一契约（主群 IntentLayer 收口）。
 *
 * 观测与路由映射优先读本类型；Worker 将 unified 映射为 `ceo-v2` `IntentDecision`（schema 1.0）以复用治理/planning 信封。
 *
 * canonical 类须与 `@foundry/contracts/types/collaboration-2026` 的 `CollaborationIntentType2026` 及 Worker Zod 保持一致。
 */

import type { IntentRoutePath } from './ceo-v2.js';

export type CollaborationIntentCanonical =
  | 'audience_resolution'
  | 'direct_summon'
  | 'approval'
  | 'strategy'
  | 'orchestration'
  | 'ceo_reply'
  | 'unknown';

export type CollaborationIntentRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CollaborationIntentRoutingHints2026 {
  riskLevel: CollaborationIntentRiskLevel;
  requiresParallelism: boolean;
  shouldExecute: boolean;
  suggestedDepartmentSlugs: string[];
  /** 已在房内、可直连回复的 agentId（召唤强规则产物） */
  targetAgentIds?: string[];
  /** 解析与置信度、房内 roster 均满足时的强定向标记 */
  explicitDirectTargets?: boolean;
  /** @ 解析到但不在房间成员内的 agentId（用于邀请提示） */
  summonAgentsMissingFromRoom?: string[];
}

/** 2026.2：主管解析状态（机器侧，供观测与 formatter）。 */
export type CollaborationDirectorResolutionStatus = 'matched' | 'ambiguous' | 'none' | 'skipped';

export interface CollaborationDirectorResolution2026 {
  status: CollaborationDirectorResolutionStatus;
  chosenAgentIds: string[];
  candidateIdsBeforeFilter: string[];
  /** 部分候选被白名单剔除，但仍有至少一名可直连（多 Agent / 群组召唤常见）。 */
  partialGroupMatch?: boolean;
  /** 被剔除的候选 id（仅观测与 Prompt 自检；不保证均为 UUID）。 */
  droppedCandidateIds?: string[];
}

/** 可选用户可见副本（CEO 代发等）：**仅服务端策略写入**；受众路由 LLM 不产出此字段。 */
export interface CollaborationUserFacingReply2026 {
  text: string;
}

/** 2026.2：可选轻量自答（与 userFacingReply 合并展示策略由 Worker 决定）。 */
export interface CollaborationIntentSelfReply2026 {
  enabled: boolean;
  draft?: string;
}

/** 主群：听众解析（白名单前）与可直连目标分离，供观测与 replay 策略。 */
export interface CollaborationMainRoomAudienceHandoff2026 {
  audienceResolvedTargetAgentIds: string[];
}

/**
 * CPO 统一 IntentDecision（schema 2026.1 / 2026.2）。
 * 命名上与 `ceo-v2.IntentDecision`（蓝图信封）区分。
 */
export interface CollaborationIntentDecisionV20261 {
  schemaVersion: '2026.1' | '2026.2';
  intentType: CollaborationIntentCanonical;
  confidence: number;
  /** 受众 / IntentLayer 侧置信度（与 Strategy 规划侧再评分区分时可单独记录）。 */
  audienceConfidence?: number;
  /** Strategy 规划侧再评分后的置信度（若与受众层分离）。 */
  strategyConfidence?: number;
  routingHints: CollaborationIntentRoutingHints2026;
  explanation: string;
  traceId: string;
  roomId: string;
  /** 可选用户可见答复正文：服务端策略填充；非受众 LLM 输出。 */
  userFacingReply?: CollaborationUserFacingReply2026;
  /** 2026.2：主群听众解析快照（白名单前）。 */
  mainRoomAudienceHandoff?: CollaborationMainRoomAudienceHandoff2026;
  directorResolution?: CollaborationDirectorResolution2026;
  intentSelfReply?: CollaborationIntentSelfReply2026;
  /** Turn Tool-First 观测（不驱动第二条执行链） */
  collaborationTurn?: { orchestrationRan: boolean; readiness?: string };
}
