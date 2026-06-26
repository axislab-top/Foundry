import type { IntentDecision } from '@contracts/types';
import type { MainRoomHeavyPipelineKind } from './main-room-heavy-pipeline-entry.util.js';

/** CEO replay 执行委托：metadata.replayInvokeExecutionLayers === true。 */
export function intentHasReplayDelegatedExecution(intentDecision: IntentDecision): boolean {
  const m = intentDecision.metadata;
  if (!m || typeof m !== 'object') return false;
  return (m as Record<string, unknown>).replayInvokeExecutionLayers === true;
}

export function readReplayHeavyPipelineKindFromIntent(intentDecision: IntentDecision): MainRoomHeavyPipelineKind {
  const m = intentDecision.metadata && typeof intentDecision.metadata === 'object' ? intentDecision.metadata : null;
  const raw = String((m as Record<string, unknown> | null)?.replayHeavyPipelineKind ?? 'full').trim();
  if (raw === 'dispatch_plan_compile_and_flush' || raw === 'dispatch_plan_revise') return raw;
  return 'full';
}
