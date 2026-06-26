import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import { snapshotUnifiedIntentForPublish } from './intent-snapshot.util.js';

describe('snapshotUnifiedIntentForPublish', () => {
  const base: CollaborationIntentDecisionV20261 = {
    schemaVersion: '2026.1',
    traceId: 't1',
    roomId: 'r1',
    intentType: 'strategy',
    confidence: 0.8,

    explanation: 'e',
    routingHints: {
      riskLevel: 'low',
      requiresParallelism: false,
      shouldExecute: false,
      suggestedDepartmentSlugs: [],
    },
  };

  it('returns a deep copy not aliasing nested routingHints', () => {
    const snap = snapshotUnifiedIntentForPublish(base);
    expect(snap).not.toBe(base);
    expect(snap.routingHints).not.toBe(base.routingHints);
    (base.routingHints as { suggestedDepartmentSlugs: string[] }).suggestedDepartmentSlugs.push('x');
    expect(snap.routingHints.suggestedDepartmentSlugs).toEqual([]);
  });
});
