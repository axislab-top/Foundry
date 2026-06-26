import type { IntentDecision, IntentRoutePath } from '@contracts/types';

/** 从 legacy IntentDecision 推导 pipeline 路由路径（含 replay 覆写与直连目标）。 */
export function resolvePipelineRoutePath(intentDecision: IntentDecision): IntentRoutePath {
  if (intentDecision.metadata?.replayInvokeExecutionLayers === true) return 'execution';
  const explicit =
    typeof intentDecision.metadata?.routePath === 'string'
      ? (intentDecision.metadata.routePath as IntentRoutePath)
      : null;
  if (explicit) return explicit;
  if (intentDecision.targetIds.length > 0) {
    return intentDecision.targetIds.length > 1 ? 'direct_group' : 'direct_agent';
  }
  return 'l1';
}
