import type { CollaborationRoutedIntent } from './intent-types.js';

export interface HeuristicIntentResult {
  mode: CollaborationRoutedIntent;
  confidence: number;
  mentionedAgentIds: string[];
}

/**
 * 无 LLM 时的快速路径：审批关键词、执行/讨论/直聊显式信号、单 @ 非 CEO。
 * 不读取 room.collaborationMode（由 CEO 决策接管）。
 */
export function collaborationRoutingHeuristic(
  text: string,
  mentioned: string[],
  ceoId: string | null,
): HeuristicIntentResult | null {
  const t = text.trim();
  if (!t) return null;

  if (/(同意|批准|通过|驳回|拒绝)/.test(t) && /审批|approval|CEO/i.test(t)) {
    return { mode: 'approval', confidence: 0.82, mentionedAgentIds: mentioned };
  }

  const execKw =
    /(开始执行|立刻执行|执行计划|上线|拆解并执行|run\s+it|execute(\s+the)?\s+plan|ship\s+it)/i.test(t);
  if (execKw) {
    return { mode: 'execution', confidence: 0.9, mentionedAgentIds: mentioned };
  }

  const discussKw = /(brainstorm|头脑风暴|大家一起|讨论一下|开个会|征集意见)/i.test(t);
  if (discussKw) {
    return { mode: 'discussion', confidence: 0.88, mentionedAgentIds: mentioned };
  }

  if (ceoId && mentioned.length >= 1 && mentioned.every((id) => id === ceoId) && !execKw) {
    return { mode: 'discussion', confidence: 0.93, mentionedAgentIds: mentioned };
  }

  const nonCeo = mentioned.filter((id) => !ceoId || id !== ceoId);
  if (mentioned.length === 1 && nonCeo.length === 1 && !execKw) {
    return { mode: 'direct', confidence: 0.9, mentionedAgentIds: mentioned };
  }

  return null;
}

export function fallbackIntentFromEmptyModel(
  mentioned: string[],
  ceoId: string | null,
): HeuristicIntentResult {
  if (mentioned.length === 1 && (!ceoId || mentioned[0] !== ceoId)) {
    return { mode: 'direct', confidence: 0.55, mentionedAgentIds: mentioned };
  }
  return { mode: 'discussion', confidence: 0.55, mentionedAgentIds: mentioned };
}
