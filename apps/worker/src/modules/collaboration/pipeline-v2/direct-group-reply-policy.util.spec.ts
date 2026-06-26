import {
  mapWithConcurrency,
  patchUnifiedRoutingTargetIds,
  sanitizeUnifiedUserFacingForMultiDirectGroup,
  stripCeoFromAudienceMultiSummonTargets,
  intentDecisionWithResolvedTargetIds,
} from './direct-group-reply-policy.util.js';
import type { CollaborationIntentDecisionV20261, IntentDecision } from '@contracts/types';

describe('mapWithConcurrency', () => {
  it('preserves input order in results', async () => {
    const delays = [30, 10, 20];
    const out = await mapWithConcurrency(['a', 'b', 'c'], 2, async (ch, i) => {
      await new Promise((r) => setTimeout(r, delays[i]));
      return `${ch}${i}`;
    });
    expect(out).toEqual(['a0', 'b1', 'c2']);
  });
});

describe('stripCeoFromAudienceMultiSummonTargets', () => {
  const ceo = '3777978f-3033-4846-900c-5ac50ce35564';
  const d1 = '0cc738e8-cf5b-42db-ab18-ebbb9c8f8ce8';

  it('removes CEO when audience_resolution, multi, CEO not mentioned', () => {
    expect(
      stripCeoFromAudienceMultiSummonTargets({
        targetAgentIds: [d1, ceo],
        ceoAgentId: ceo,
        intentType: 'audience_resolution',
        mentionedAgentIds: [],
        enabled: true,
      }),
    ).toEqual([d1]);
  });

  it('keeps CEO when @ CEO', () => {
    expect(
      stripCeoFromAudienceMultiSummonTargets({
        targetAgentIds: [d1, ceo],
        ceoAgentId: ceo,
        intentType: 'audience_resolution',
        mentionedAgentIds: [ceo],
        enabled: true,
      }),
    ).toEqual([d1, ceo]);
  });

  it('no-op when intent is not audience_resolution', () => {
    expect(
      stripCeoFromAudienceMultiSummonTargets({
        targetAgentIds: [d1, ceo],
        ceoAgentId: ceo,
        intentType: 'direct_summon',
        mentionedAgentIds: [],
        enabled: true,
      }),
    ).toEqual([d1, ceo]);
  });
});

describe('sanitizeUnifiedUserFacingForMultiDirectGroup', () => {
  const base: CollaborationIntentDecisionV20261 = {
    schemaVersion: '2026.2',
    intentType: 'audience_resolution',
    confidence: 0.9,

    routingHints: {
      riskLevel: 'low',
      requiresParallelism: false,
      shouldExecute: false,
      suggestedDepartmentSlugs: [],
    },
    explanation: 'x',
    traceId: 't',
    roomId: 'r',
    userFacingReply: { text: '请各位部门主管依次介绍。' },
  };

  it('replaces host-like userFacingReply when multi-direct', () => {
    const u = sanitizeUnifiedUserFacingForMultiDirectGroup(base, 3, true);
    expect(u?.userFacingReply?.text).toBe('好的。');
  });

  it('leaves short ack unchanged', () => {
    const u = sanitizeUnifiedUserFacingForMultiDirectGroup(
      { ...base, userFacingReply: { text: '收到。' } },
      3,
      true,
    );
    expect(u?.userFacingReply?.text).toBe('收到。');
  });
});

describe('patchUnifiedRoutingTargetIds', () => {
  it('sets requiresParallelism from target count', () => {
    const u: CollaborationIntentDecisionV20261 = {
      schemaVersion: '2026.2',
      intentType: 'audience_resolution',
      confidence: 0.9,
  
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        suggestedDepartmentSlugs: [],
        targetAgentIds: ['a'],
      },
      explanation: 'x',
      traceId: 't',
      roomId: 'r',
    };
    const p = patchUnifiedRoutingTargetIds(u, ['x', 'y']);
    expect(p?.routingHints.targetAgentIds).toEqual(['x', 'y']);
    expect(p?.routingHints.requiresParallelism).toBe(true);
  });
});

describe('intentDecisionWithResolvedTargetIds', () => {
  it('writes targetIds and resolvedTargetAgentIds', () => {
    const d = { intentType: 'audience_resolution', targetIds: ['old'], targetMode: 'single_agent' } as IntentDecision;
    const n = intentDecisionWithResolvedTargetIds(d, ['a', 'b']);
    expect(n.targetIds).toEqual(['a', 'b']);
    expect(n.targetMode).toBe('multi_agent');
    expect((n.metadata as { resolvedTargetAgentIds: string[] }).resolvedTargetAgentIds).toEqual(['a', 'b']);
  });
});
