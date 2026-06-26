import type { CollaborationIntentDecisionV20261, MainRoomDispatchPlanSessionPayload } from '@contracts/types';
import type { IntentDecision as CollaborationIntentDecision2026 } from '../contracts/collaboration-2026.contracts.js';
import { wantsAudienceDirectHandoff } from '../intent/intent-audience.util.js';
import {
  computeAllowedHeavyPipelineKinds,
  resolveDispatchPlanDeterministicHeavyPipeline,
  type MainRoomHeavyPipelineKind,
} from './main-room-heavy-pipeline-entry.util.js';

/** 主群 Intent 后统一路由（优先级见 ADR / 运维手册 v2 节）。 */
export type MainRoomRoute =
  | {
      kind: 'dispatch_plan_heavy';
      heavyKind: Extract<
        MainRoomHeavyPipelineKind,
        'dispatch_plan_compile_and_flush' | 'dispatch_plan_revise'
      >;
      ackText: string;
    }
  | { kind: 'explicit_directed' }
  | { kind: 'direct_summon_unresolved_surface' }
  | { kind: 'ceo_replay_delegate'; entry: 'only_ceo_summon' | 'default_ceo_line' };

export function dispatchPlanHeavyAckText(
  heavyKind: 'dispatch_plan_compile_and_flush' | 'dispatch_plan_revise',
): string {
  return heavyKind === 'dispatch_plan_revise'
    ? '收到，我来调整执行计划。'
    : '收到，正在向各部门下发执行计划。';
}

function normalizeIds(ids: string[] | undefined | null): string[] {
  return (ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean);
}

/** 用户显式 @CEO（正文 @CEO、mention 列表或 Intent 仅指向 CEO）。 */
export function userSummonedCeo(params: {
  ceoAgentId?: string | null;
  mentionedAgentIds?: string[] | null;
  routingTargetAgentIds?: string[] | null;
  userText?: string | null;
}): boolean {
  const text = String(params.userText ?? '').trim();
  if (/@(?:CEO|ceo)\b/u.test(text) || /@首席执行官/u.test(text)) {
    return true;
  }
  const ceoId = String(params.ceoAgentId ?? '').trim();
  if (!ceoId) return false;
  const ceoLower = ceoId.toLowerCase();
  const mentioned = normalizeIds(params.mentionedAgentIds);
  if (mentioned.some((id) => id.toLowerCase() === ceoLower)) return true;
  const targets = normalizeIds(params.routingTargetAgentIds);
  if (
    targets.length === 1 &&
    targets[0]!.toLowerCase() === ceoLower
  ) {
    return true;
  }
  return false;
}

/**
 * 统一主群 post-intent 路由 SSOT。
 * 优先级：dispatch_plan_heavy > @CEO/execution(v2) → ceo_replay > explicit_directed > …
 */
export function resolveMainRoomRoute(params: {
  dispatchPlanV2Enabled?: boolean;
  dispatchPlanSession?: MainRoomDispatchPlanSessionPayload | null;
  userText: string;
  layerDecision: CollaborationIntentDecision2026;
  intentDecision2026_1: CollaborationIntentDecisionV20261;
  ceoAgentId?: string | null;
  mentionedAgentIds?: string[] | null;
  collaborationMode?: string | null;
  confirmationIntent?: string | null;
  userConfirmedDispatchFlush?: boolean;
  maxDirect: number;
}): MainRoomRoute {
  const dispatchPlanV2Enabled = params.dispatchPlanV2Enabled === true;
  if (dispatchPlanV2Enabled) {
    const dpKind = resolveDispatchPlanDeterministicHeavyPipeline({
      dispatchPlanV2Enabled: true,
      session: params.dispatchPlanSession ?? null,
      userText: params.userText,
      confirmationIntent: params.confirmationIntent,
      userConfirmedDispatchFlush: params.userConfirmedDispatchFlush,
    });
    if (dpKind) {
      const allowed = computeAllowedHeavyPipelineKinds({
        dispatchPlanV2Enabled: true,
        dispatchPlanSession: params.dispatchPlanSession ?? null,
      });
      if (allowed.has(dpKind)) {
        return {
          kind: 'dispatch_plan_heavy',
          heavyKind: dpKind,
          ackText: dispatchPlanHeavyAckText(dpKind),
        };
      }
    }
  }

  const { layerDecision, intentDecision2026_1, ceoAgentId, maxDirect } = params;
  const rhSummonIds = (layerDecision.routingHints.targetAgentIds ?? [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)
    .slice(0, maxDirect);

  const summonedCeo = userSummonedCeo({
    ceoAgentId,
    mentionedAgentIds: params.mentionedAgentIds,
    routingTargetAgentIds: rhSummonIds,
    userText: params.userText,
  });
  const executionMode = String(params.collaborationMode ?? '').trim() === 'execution';
  const ceoOwnsTurn = summonedCeo || (executionMode && dispatchPlanV2Enabled);

  if (ceoOwnsTurn) {
    const onlyCeoSummoned =
      rhSummonIds.length === 1 &&
      Boolean(ceoAgentId) &&
      rhSummonIds[0].toLowerCase() === String(ceoAgentId).trim().toLowerCase();
    return {
      kind: 'ceo_replay_delegate',
      entry: onlyCeoSummoned ? 'only_ceo_summon' : 'default_ceo_line',
    };
  }

  const wantsDirectedReply =
    rhSummonIds.length > 0 ||
    wantsAudienceDirectHandoff(layerDecision) ||
    (Array.isArray(intentDecision2026_1.routingHints?.targetAgentIds) &&
      intentDecision2026_1.routingHints!.targetAgentIds!.length > 0);

  const directGate =
    rhSummonIds.length > 0 &&
    (layerDecision.routingHints.explicitDirectTargets === true || wantsDirectedReply);

  if (directGate) {
    return { kind: 'explicit_directed' };
  }
  if (wantsDirectedReply && rhSummonIds.length === 0) {
    return { kind: 'direct_summon_unresolved_surface' };
  }
  return {
    kind: 'ceo_replay_delegate',
    entry: 'default_ceo_line',
  };
}
