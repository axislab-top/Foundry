import { coerceIntentRuleTypeTo2026 } from '@contracts/types';
import type { IntentDecision as CollaborationIntentDecision2026 } from '../contracts/collaboration-2026.contracts.js';
import { isDirectSummonCanonicalIntent } from './intent-direct-summon.util.js';
import { mainRoomAudiencePolicyBlocksAutoHandoffFromIntent } from './main-room-audience-handoff.policy.js';

/**
 * CEO 线受众（轻答 / 编排 memory-first 等）。
 * 主群 Intent 层固定 `audience_resolution`，无房内直连目标时即 CEO 线。
 */
export function isCeoAudienceIntentType(intentType: string | null | undefined): boolean {
  const t = coerceIntentRuleTypeTo2026(intentType);
  return t === 'ceo_reply' || t === 'audience_resolution';
}

/** 是否已解析到可直连的房内 Agent 目标。 */
export function hasResolvedAudienceDirectTargets(
  layerDecision: Pick<CollaborationIntentDecision2026, 'routingHints'>,
): boolean {
  const rh = layerDecision.routingHints;
  return (rh.targetAgentIds?.length ?? 0) > 0 && rh.explicitDirectTargets !== false;
}

/**
 * 本轮是否尝试或语义上需要房内 Agent 直连接话（含 legacy `direct_summon` 信封）。
 * 用于 post-intent 路由：区分「应直连但未解析到 target」与「默认 CEO 线」。
 */
export function wantsAudienceDirectHandoff(layerDecision: CollaborationIntentDecision2026): boolean {
  if (mainRoomAudiencePolicyBlocksAutoHandoffFromIntent(layerDecision)) {
    return false;
  }
  if (hasResolvedAudienceDirectTargets(layerDecision)) return true;

  const dr = layerDecision.directorResolution;
  if ((dr?.candidateIdsBeforeFilter?.length ?? 0) > 0) return true;
  if ((layerDecision.mainRoomAudienceHandoff?.audienceResolvedTargetAgentIds?.length ?? 0) > 0) {
    return true;
  }
  if (String(layerDecision.userFacingReply?.text ?? '').trim()) return true;

  const meta =
    layerDecision.metadata && typeof layerDecision.metadata === 'object'
      ? (layerDecision.metadata as Record<string, unknown>)
      : {};
  if (meta.primaryAudience === 'in_room_agents') return true;

  return isDirectSummonCanonicalIntent(layerDecision.intentType);
}
