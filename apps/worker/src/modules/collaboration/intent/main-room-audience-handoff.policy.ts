import type { IntentDecision } from '../contracts/collaboration-2026.contracts.js';

/**
 * 主群 **听众解析 vs 策略可直连** 的单一产品口径。
 *
 * - `audienceResolvedTargetAgentIds`：听众层 + Summon enrich 之后、**主管白名单之前**的房内目标。
 * - `routingHints.targetAgentIds`：白名单之后、**实际允许直连**的目标。
 *
 * 当「解析到有人」但「策略不允许自动手递」时，应由 CEO replay 自然收口，而不是「主管召唤失败」固定句或记忆图误杀。
 */
export function isMainRoomAudiencePolicyBlockingAutoHandoff(params: {
  intentType: string;
  /** 与 `IntentDecision.mainRoomAudienceHandoff.audienceResolvedTargetAgentIds` 一致 */
  audienceResolvedTargetAgentIds: string[] | undefined;
  /** 与 `routingHints.targetAgentIds` 一致 */
  policyRoutableTargetAgentIds: string[] | undefined;
}): boolean {
  if (String(params.intentType ?? '').trim() !== 'audience_resolution') return false;
  const resolved = (params.audienceResolvedTargetAgentIds ?? [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  const routable = (params.policyRoutableTargetAgentIds ?? [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  return resolved.length > 0 && routable.length === 0;
}

/** 从管线上的 `IntentDecision` 读取 handoff + routable，避免 replay 路由层重复拼字段。 */
export function mainRoomAudiencePolicyBlocksAutoHandoffFromIntent(
  layer: Pick<IntentDecision, 'intentType' | 'mainRoomAudienceHandoff' | 'routingHints'>,
): boolean {
  return isMainRoomAudiencePolicyBlockingAutoHandoff({
    intentType: layer.intentType,
    audienceResolvedTargetAgentIds: layer.mainRoomAudienceHandoff?.audienceResolvedTargetAgentIds,
    policyRoutableTargetAgentIds: layer.routingHints.targetAgentIds,
  });
}
