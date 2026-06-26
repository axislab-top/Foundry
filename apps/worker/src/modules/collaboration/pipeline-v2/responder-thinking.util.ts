import type { CollaborationResponderCeoLayer } from '@contracts/events';
import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import type { MainRoomRoute } from './resolve-main-room-route.util.js';

export type ThinkingRespondersResult = {
  agentIds: string[];
  ceoLayer?: CollaborationResponderCeoLayer;
};

const DIRECT_ROUTE_PATHS = new Set(['direct_agent', 'direct_group']);

function isDirectAudienceRoute(
  routePath: string,
  intentDecision?: CollaborationIntentDecisionV20261 | null,
): boolean {
  if (DIRECT_ROUTE_PATHS.has(routePath)) return true;
  const rh = intentDecision?.routingHints;
  return rh?.explicitDirectTargets === true && (rh.targetAgentIds?.length ?? 0) > 0;
}

function resolveCeoLayer(routePath: string): CollaborationResponderCeoLayer {
  const r = routePath.toLowerCase();
  if (
    r.includes('strategy') ||
    r.includes('execution') ||
    r === 'strategy_goal_draft' ||
    r === 'strategy_contract_failed'
  ) {
    return 'L1';
  }
  if (r.includes('approval') || r.includes('supervision') || r === 'approval') {
    return 'L3';
  }
  return 'L2';
}

export function resolveThinkingResponders(params: {
  routePath: string;
  intentType: string;
  ceoAgentId: string | null;
  intentDecision2026?: CollaborationIntentDecisionV20261 | null;
  inlineReplyHandled?: boolean;
}): ThinkingRespondersResult {
  void params.intentType;
  if (params.inlineReplyHandled) {
    return { agentIds: [] };
  }

  const routePath = String(params.routePath ?? '').trim();

  if (isDirectAudienceRoute(routePath, params.intentDecision2026)) {
    const ids = (params.intentDecision2026?.routingHints?.targetAgentIds ?? [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean)
      .slice(0, 24);
    return { agentIds: ids };
  }

  const ceoId = String(params.ceoAgentId ?? '').trim();
  if (!ceoId) {
    return { agentIds: [] };
  }

  return {
    agentIds: [ceoId],
    ceoLayer: resolveCeoLayer(routePath),
  };
}

/**
 * [阶段1.1] 在 `runMainRoomFlow` 内、确定 `earlyRoute` 之后、生成之前解析「应当先发思考气泡」的接话人。
 *
 * 与生成后的 {@link resolveThinkingResponders} 区别：此处只有 `earlyRoute` 作为信号（最终 routePath 尚未产生），
 * 但对最常见的几条路径接话人是确定的：
 * - `explicit_directed`：被点名的受众 agent（CEO 不介入）。
 * - 其余（`ceo_replay_delegate` / `dispatch_plan_heavy` / `direct_summon_unresolved_surface`）：
 *   均由 CEO 接话（重链/回放/兜底）。
 *
 * 仅在能确定接话人时返回非空；否则回退到生成后的 {@link resolveThinkingResponders}（由 listener 兜底发布）。
 */
export function resolveEarlyThinkingFromRoute(params: {
  routeKind: MainRoomRoute['kind'] | 'dispatch_plan_heavy';
  ceoAgentId: string | null;
  directTargetIds?: string[];
}): ThinkingRespondersResult {
  if (params.routeKind === 'explicit_directed') {
    const ids = (params.directTargetIds ?? [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean)
      .slice(0, 24);
    return { agentIds: ids };
  }

  const ceoId = String(params.ceoAgentId ?? '').trim();
  if (!ceoId) {
    return { agentIds: [] };
  }

  const heavy = params.routeKind === 'dispatch_plan_heavy';
  return {
    agentIds: [ceoId],
    ceoLayer: heavy ? 'L1' : 'L2',
  };
}
