import {
  buildCollaborationIntentDecisionV20261,
} from './intent-unified-mapping.js';

describe('buildCollaborationIntentDecisionV20261', () => {
  const baseLayer = {
    intentType: 'audience_resolution' as const,
    confidence: 0.77,
    explanation: 'test',
    routingHints: {
      riskLevel: 'low' as const,
      requiresParallelism: false,
      shouldExecute: false,
    },
    targetDepartmentSlugs: [] as string[],
  };

  it('sets audienceConfidence from layer when omitted', () => {
    const u = buildCollaborationIntentDecisionV20261({
      traceId: 't1',
      roomId: 'r1',
      layer: baseLayer,
      hasValidDirectAgentTargets: false,
    });
    expect(u.audienceConfidence).toBe(0.77);
  });

  it('allows explicit audienceConfidence and strategyConfidence', () => {
    const u = buildCollaborationIntentDecisionV20261({
      traceId: 't1',
      roomId: 'r1',
      audienceConfidence: 0.6,
      strategyConfidence: 0.9,
      layer: { ...baseLayer, confidence: 0.88 },
      hasValidDirectAgentTargets: false,
    });
    expect(u.audienceConfidence).toBe(0.6);
    expect(u.strategyConfidence).toBe(0.9);
    expect(u.confidence).toBe(0.88);
  });

  it('does not include targetResponder in output', () => {
    const u = buildCollaborationIntentDecisionV20261({
      traceId: 't1',
      roomId: 'r1',
      layer: baseLayer,
      hasValidDirectAgentTargets: true,
    });
    expect(u).not.toHaveProperty('targetResponder');
  });

  it('includes targetAgentIds in routingHints when provided', () => {
    const u = buildCollaborationIntentDecisionV20261({
      traceId: 't1',
      roomId: 'r1',
      layer: { ...baseLayer, targetAgentIds: ['agent-1', 'agent-2'] },
      hasValidDirectAgentTargets: true,
    });
    expect(u.routingHints.targetAgentIds).toEqual(['agent-1', 'agent-2']);
  });
});
