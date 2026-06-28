/**
 * 自治 LangGraph：plan 后短路判定（与主群 CEO **replay** {@link evaluateCeoReplayEligibility} 无关）。
 */

import {
  computeMemoryGraphConfidence,
  isCeoReplayIntentConfidenceGate,
  isPureMemoryFactualLightQuery,
} from './ceo-replay-eligibility.js';

export type EarlyExitUnifiedRouteTag = 'ceo_reply' | 'direct_agent' | 'autonomous_graph' | 'none';

/** @deprecated 自治图内部历史类型名；语义为「plan 后是否短路扩展」 */
export type UnifiedEarlyExitEvaluation = {
  canEarlyExit: boolean;
  confidence: number;
  reason: string;
  suggestedReply?: string;
  routeTag: EarlyExitUnifiedRouteTag;
};

/** @deprecated 使用 {@link isCeoReplayIntentConfidenceGate} */
export function isFastPathIntentGate(intentType: string, confidence: number, contentText?: string): boolean {
  return isCeoReplayIntentConfidenceGate(intentType, confidence, contentText);
}

/** @deprecated 使用 {@link isPureMemoryFactualLightQuery} */
export function isPureMemoryFactualQuestionForEarlyExit(text: string): boolean {
  return isPureMemoryFactualLightQuery(text);
}

/**
 * 自治 LangGraph：plan 后无任务、无审批、记忆足够且（breakdown 时）用户目标偏轻量记忆问句。
 */
export function evaluateAutonomousGraphEarlyExit(params: {
  earlyExitEnabled: boolean;
  confidenceThreshold: number;
  runKind: string;
  goal: string;
  planTasksLength: number;
  requiresHumanApproval: boolean;
  memoryHits: unknown[];
}): UnifiedEarlyExitEvaluation {
  if (!params.earlyExitEnabled) {
    return { canEarlyExit: false, confidence: 0, reason: 'ceo_early_exit_disabled', routeTag: 'none' };
  }
  if (params.requiresHumanApproval || params.planTasksLength > 0) {
    return { canEarlyExit: false, confidence: 0.12, reason: 'plan_tasks_or_approval', routeTag: 'none' };
  }
  const mem = computeMemoryGraphConfidence(params.memoryHits);
  if (mem <= params.confidenceThreshold) {
    return {
      canEarlyExit: false,
      confidence: mem,
      reason: 'memory_graph_confidence_below_threshold',
      routeTag: 'autonomous_graph',
    };
  }
  let chars = 0;
  if (Array.isArray(params.memoryHits)) {
    for (const h of params.memoryHits.slice(0, 6)) {
      const o = h as Record<string, unknown>;
      const s =
        typeof o.snippet === 'string' ? o.snippet : typeof o.content === 'string' ? String(o.content) : '';
      chars += s.trim().length;
    }
  }
  if (chars < 40) {
    return { canEarlyExit: false, confidence: mem, reason: 'memory_snippets_too_short', routeTag: 'autonomous_graph' };
  }
  if (params.runKind === 'breakdown' && params.goal?.trim()) {
    const g = params.goal.trim();
    if (/执行|部署|上线|拆解|规划|里程碑|项目计划|多步|审批|合同|预算|写代码|实现/i.test(g)) {
      return { canEarlyExit: false, confidence: mem, reason: 'goal_looks_complex', routeTag: 'autonomous_graph' };
    }
    if (!isPureMemoryFactualLightQuery(g) && g.length > 80) {
      return { canEarlyExit: false, confidence: mem, reason: 'goal_not_memory_factual', routeTag: 'autonomous_graph' };
    }
  }
  return {
    canEarlyExit: true,
    confidence: mem,
    reason: 'unified_autonomous_early_exit_hit',
    routeTag: 'autonomous_graph',
  };
}
