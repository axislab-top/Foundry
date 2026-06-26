import type { CollaborationIntentDecisionV20261, IntentDecision } from '@contracts/types';
import { tryUnifiedIntentFromPipelineIntentDecision } from './unified-l1-pipeline.util.js';

describe('tryUnifiedIntentFromPipelineIntentDecision', () => {
  const unified: CollaborationIntentDecisionV20261 = {
    schemaVersion: '2026.1',
    traceId: 't1',
    roomId: 'r1',
    intentType: 'strategy',
    confidence: 0.85,

    explanation: 'plan',
    routingHints: {
      riskLevel: 'low',
      requiresParallelism: false,
      shouldExecute: false,
      suggestedDepartmentSlugs: [],
    },
  };

  it('returns unified when classifier + SSOT present', () => {
    const id = {
      schemaVersion: '1.0',
      intentType: 'strategy',
      confidence: 0.85,
      explanation: 'x',
      traceId: 't1',
      roomId: 'r1',
      requestedBy: 'u1',
      metadata: {
        classifier: 'intent_layer_unified_v2026_1',
        intentDecision2026_1: unified,
      },
    } as unknown as IntentDecision;
    expect(tryUnifiedIntentFromPipelineIntentDecision(id)).toEqual(unified);
  });

  it('returns undefined for legacy classifier', () => {
    const id = {
      schemaVersion: '1.0',
      intentType: 'strategy',
      confidence: 0.85,
      explanation: 'x',
      traceId: 't1',
      roomId: 'r1',
      requestedBy: 'u1',
      metadata: { classifier: 'legacy_intent_recognizer', intentDecision2026_1: unified },
    } as unknown as IntentDecision;
    expect(tryUnifiedIntentFromPipelineIntentDecision(id)).toBeUndefined();
  });

  it('returns undefined when schemaVersion mismatch', () => {
    const bad = { ...unified, schemaVersion: '2099.9' };
    const id = {
      schemaVersion: '1.0',
      intentType: 'strategy',
      confidence: 0.85,
      explanation: 'x',
      traceId: 't1',
      roomId: 'r1',
      requestedBy: 'u1',
      metadata: {
        classifier: 'intent_layer_unified_v2026_1',
        intentDecision2026_1: bad,
      },
    } as unknown as IntentDecision;
    expect(tryUnifiedIntentFromPipelineIntentDecision(id)).toBeUndefined();
  });
});
