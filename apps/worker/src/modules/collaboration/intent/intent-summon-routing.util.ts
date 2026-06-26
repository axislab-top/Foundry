import type { CollaborationIntentDecisionV20261, IntentDecision as CeoV2IntentDecision } from '@contracts/types';
import type { IntentDecision as CollaborationIntentDecision2026 } from '../contracts/collaboration-2026.contracts.js';
import { isDirectSummonCanonicalIntent } from './intent-direct-summon.util.js';

/** 2026 `IntentDecision`：直连房内 agent（与 L1 planning 等路径正交） */
export function isSummonRoutingIntentCollaboration2026(
  intentDecision: CollaborationIntentDecision2026,
): boolean {
  const rh = intentDecision.routingHints;
  const ids = rh?.targetAgentIds;
  if (Array.isArray(ids) && ids.length > 0 && rh?.explicitDirectTargets === true) {
    return true;
  }
  const meta =
    intentDecision.metadata && typeof intentDecision.metadata === 'object'
      ? (intentDecision.metadata as Record<string, unknown>)
      : {};
  if (meta.primaryAudience === 'in_room_agents') return true;
  const it = String(intentDecision.intentType ?? '').trim();
  return isDirectSummonCanonicalIntent(it);
}

/**
 * CEO v2 `IntentDecision` 信封：unified SSOT、主群路由快照。
 */
export function isSummonRoutingIntentCeoV2(intentDecision: CeoV2IntentDecision): boolean {
  // 直连目标：targetIds 已填充
  if (Array.isArray(intentDecision.targetIds) && intentDecision.targetIds.length > 0) {
    return true;
  }
  const meta =
    intentDecision.metadata && typeof intentDecision.metadata === 'object'
      ? (intentDecision.metadata as Record<string, unknown>)
      : {};
  if (meta.primaryAudience === 'in_room_agents') return true;

  const rawUnified = meta.intentDecision2026_1;
  if (rawUnified && typeof rawUnified === 'object') {
    const u = rawUnified as CollaborationIntentDecisionV20261;
    if (u.schemaVersion === '2026.1' || u.schemaVersion === '2026.2') {
      if (isDirectSummonCanonicalIntent(u.intentType)) return true;
      if (Array.isArray(u.routingHints?.targetAgentIds) && u.routingHints.targetAgentIds.length > 0) return true;
    }
  }

  const layer = meta.intentLayer;
  if (layer && typeof layer === 'object') {
    const lo = layer as Record<string, unknown>;
    const lit = String(lo.intentType ?? '').trim();
    if (isDirectSummonCanonicalIntent(lit)) return true;
    const lm = lo.metadata;
    if (lm && typeof lm === 'object') {
      const lrec = lm as Record<string, unknown>;
      if (lrec.primaryAudience === 'in_room_agents') return true;
    }
  }

  return false;
}
