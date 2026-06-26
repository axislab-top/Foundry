import type { CollaborationIntentDecisionV20261, IntentDecision } from '@contracts/types';

/**
 * 主群 IntentLayer → `IntentDecision.metadata` 上挂载的 2026.1 SSOT；
 * 仅当 classifier 标记为 unified 路径时才解析，供 L1 planning 等下游安全消费。
 */
export function tryUnifiedIntentFromPipelineIntentDecision(
  intentDecision: IntentDecision,
): CollaborationIntentDecisionV20261 | undefined {
  const meta =
    intentDecision.metadata && typeof intentDecision.metadata === 'object'
      ? (intentDecision.metadata as Record<string, unknown>)
      : {};
  if (meta.classifier !== 'intent_layer_unified_v2026_1') return undefined;
  const raw = meta.intentDecision2026_1;
  if (!raw || typeof raw !== 'object') return undefined;
  const u = raw as CollaborationIntentDecisionV20261;
  if (u.schemaVersion !== '2026.1' && u.schemaVersion !== '2026.2') return undefined;
  return u;
}
