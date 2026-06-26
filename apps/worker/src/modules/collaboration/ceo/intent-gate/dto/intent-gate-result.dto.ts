import type { CeoDecisionResult } from '../../dto/ceo-v2-pipeline.types.js';

export type IntentGateAction = 'direct' | 'merged' | 'fallback' | 'miss';

export interface CeoIntentGateResult {
  action: IntentGateAction;
  decision?: CeoDecisionResult;
  topScore?: number;
  secondScore?: number;
}
