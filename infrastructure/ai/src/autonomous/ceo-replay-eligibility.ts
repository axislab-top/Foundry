/**
 * CEO **replay** 相关**规则型**门控与置信度工具（记忆图、节选 boost、intent 置信度带等）。
 *
 * **与 Worker 主群协作管线的关系**：`@service/worker` 的 `CollaborationPipelineV2Service.runMainRoomPostIntentRoute`
 * 在 CEO 线使用 **Replay 执行委托 LLM** 决策是否进重栈，**不调用** {@link evaluateCeoReplayEligibility}。
 * 本模块仍供自治图 early-exit、实验路径或外部编排按需引用；避免误以为「主群必然走此函数」。
 */

import { coerceIntentRuleTypeTo2026, isNaturalConversationIntentType } from '@contracts/types';

export type CeoReplayRouteTag = 'ceo_reply' | 'direct_agent' | 'none';

/** {@link evaluateCeoReplayEligibility} 的输出 */
export type CeoReplayEligibility = {
  /** 是否在本层处理（生成 natural reply） */
  shouldHandle: boolean;
  confidence: number;
  reason: string;
  suggestedReply?: string;
  routeTag: CeoReplayRouteTag;
};

/** 偏记忆/公司概况类轻问句启发（与 intent 置信度门控配合） */
export function isPureMemoryFactualLightQuery(text: string): boolean {
  const t = String(text ?? '').trim();
  if (t.length < 6 || t.length > 800) return false;
  if (/执行|部署|上线|写代码|实现|审批|合同|预算|拆解|规划|里程碑|项目计划|帮我做|请帮我/i.test(t)) {
    return false;
  }
  return /公司|企业|团队|介绍|信息|档案|概况|背景|一切|记得|关于.*谁|有谁|成员|业务/i.test(t);
}

/**
 * 从 Memory Graph / 检索命中推导 0–1 置信度（优先 score/similarity，否则片段长度启发式）。
 */
export function computeMemoryGraphConfidence(memoryHits: unknown[]): number {
  if (!Array.isArray(memoryHits) || memoryHits.length === 0) return 0;
  let scored = 0;
  let sum = 0;
  for (const h of memoryHits.slice(0, 8)) {
    const o = h as Record<string, unknown>;
    const score =
      typeof o.score === 'number'
        ? o.score
        : typeof o.similarity === 'number'
          ? o.similarity
          : typeof o.relevance === 'number'
            ? o.relevance
            : undefined;
    if (score != null && Number.isFinite(score)) {
      sum += Math.max(0, Math.min(1, Number(score)));
      scored += 1;
    }
  }
  if (scored > 0) return Math.max(0, Math.min(1, sum / scored));
  let chars = 0;
  for (const h of memoryHits.slice(0, 6)) {
    const o = h as Record<string, unknown>;
    const s =
      typeof o.snippet === 'string' ? o.snippet : typeof o.content === 'string' ? String(o.content) : '';
    chars += s.trim().length;
  }
  return Math.max(0, Math.min(1, chars / 650));
}

/** 节选块若标明不可用，则不得计入上下文置信度。 */
const REPLAY_TRANSCRIPT_UNUSABLE = /拉取失败|已关闭\s*CEO_REPLAY|不得假定存在未展示的多轮前文|本回合组装失败/i;

/**
 * 从主群 replay 预组装的「最近对话节选」推导 0–0.95 的上下文置信度，用于与 {@link computeMemoryGraphConfidence} 取 max 后过记忆门。
 * 节选足够长时可单独越过默认 ~0.92 阈值，避免「刚才说了什么」等**仅靠多轮对话**、向量记忆未命中时被误拦。
 */
export function computeReplayTranscriptContextBoost(transcriptBlock: string | null | undefined): number {
  const t = String(transcriptBlock ?? '').trim();
  if (t.length < 140) return 0;
  if (REPLAY_TRANSCRIPT_UNUSABLE.test(t)) return 0;
  return Math.min(0.95, Math.max(0, (t.length - 140) / 1800));
}

/**
 * Intent + 文本启发：是否允许进入 CEO replay 记忆快车道。
 */
export function isCeoReplayIntentConfidenceGate(intentType: string, confidence: number, contentText?: string): boolean {
  const it = coerceIntentRuleTypeTo2026(intentType);
  const c = Number(confidence);
  if (!Number.isFinite(c)) return false;
  if ((isNaturalConversationIntentType(it) || it === 'audience_resolution') && c > 0.9) return true;
  if (it === 'direct_summon' && c >= 0.88 && isPureMemoryFactualLightQuery(String(contentText ?? ''))) {
    return true;
  }
  return false;
}

export type CeoReplayEligibilityParams = {
  /** 进程 + 公司协作开关：是否允许走 CEO replay */
  replayEnabled: boolean;
  /** 记忆侧须严格大于该阈值（与 `CEO_REPLAY_MEMORY_THRESHOLD` / 回退阈值对齐） */
  confidenceThreshold: number;
  followupHintActive: boolean;
  /** 主群 + 房内守卫（房间类型、intent 基线） */
  mainRoomIntentGuardOk: boolean;
  intentType: string;
  intentConfidence: number;
  contentText: string;
  memoryHits: unknown[];
  /**
   * 主群 replay 与执行委托共用的「最近对话节选」原文（可为空）。
   * 与 {@link computeReplayTranscriptContextBoost} 联用，在记忆弱但节选充分时仍允许 natural_reply。
   */
  replayTranscriptBlock?: string | null;
  /**
   * 主群：`mainRoomAudienceHandoff` 解析到房内目标，但 `routingHints.targetAgentIds`（策略可直连）为空。
   * CEO replay 应收口，**不按记忆图阈值拦截**（与 Worker `isMainRoomAudiencePolicyBlockingAutoHandoff` 对齐）。
   */
  mainRoomAudiencePolicyBlocksAutoHandoff?: boolean;
};

/**
 * 规则型判定：是否应由 **CEO replay** 自然短回复路径处理（true 则不进三层执行栈）。
 *
 * Worker 主群 `runMainRoomPostIntentRoute` **当前未使用**本函数；协作侧开关与委托请见 Worker
 * `L1FeatureFlagService.isCeoReplayCollaborationEffective` 与 Replay 执行委托服务。
 */
export function evaluateCeoReplayEligibility(params: CeoReplayEligibilityParams): CeoReplayEligibility {
  const T = params.confidenceThreshold;
  const it = coerceIntentRuleTypeTo2026(params.intentType);
  const isSummonLightPath = it === 'direct_summon';
  const routeTag: CeoReplayRouteTag =
    isNaturalConversationIntentType(it) || it === 'audience_resolution'
      ? 'ceo_reply'
      : isSummonLightPath
        ? 'direct_agent'
        : 'none';

  if (!params.replayEnabled) {
    return { shouldHandle: false, confidence: 0, reason: 'ceo_replay_disabled', routeTag: 'none' };
  }
  if (params.followupHintActive) {
    return { shouldHandle: false, confidence: 0, reason: 'followup_hint_active', routeTag: 'none' };
  }
  if (!params.mainRoomIntentGuardOk) {
    return { shouldHandle: false, confidence: 0, reason: 'main_room_intent_guard_blocked', routeTag: 'none' };
  }
  if (!isCeoReplayIntentConfidenceGate(params.intentType, params.intentConfidence, params.contentText)) {
    return {
      shouldHandle: false,
      confidence: params.intentConfidence,
      reason: 'ceo_replay_intent_gate_miss',
      routeTag,
    };
  }
  const memRaw = computeMemoryGraphConfidence(params.memoryHits);
  const transcriptBoost = computeReplayTranscriptContextBoost(params.replayTranscriptBlock);
  const memEffective = Math.min(1, Math.max(memRaw, transcriptBoost));
  const policyBlocks = params.mainRoomAudiencePolicyBlocksAutoHandoff === true;
  const skipMemoryGateForPolicyBlockedHandoff =
    policyBlocks && it === 'audience_resolution' && Number(params.intentConfidence) > 0.9;
  if (!skipMemoryGateForPolicyBlockedHandoff && memEffective <= T) {
    return {
      shouldHandle: false,
      confidence: Math.min(params.intentConfidence, memEffective),
      reason: 'memory_graph_confidence_below_threshold',
      routeTag,
    };
  }
  const confidence = skipMemoryGateForPolicyBlockedHandoff
    ? Number(params.intentConfidence)
    : Math.min(params.intentConfidence, memEffective);
  const reason =
    skipMemoryGateForPolicyBlockedHandoff
      ? 'ceo_replay_eligible_main_room_policy_blocked_handoff'
      : transcriptBoost > memRaw && memRaw <= T
        ? 'ceo_replay_eligible_transcript_context_boost'
        : 'ceo_replay_eligible';
  return {
    shouldHandle: true,
    confidence,
    reason,
    routeTag,
  };
}
