import {
  isMainRoomAudiencePolicyBlockingAutoHandoff,
  mainRoomAudiencePolicyBlocksAutoHandoffFromIntent,
} from './main-room-audience-handoff.policy.js';

describe('isMainRoomAudiencePolicyBlockingAutoHandoff', () => {
  it('true when audience_resolution has resolved but no routable', () => {
    expect(
      isMainRoomAudiencePolicyBlockingAutoHandoff({
        intentType: 'audience_resolution',
        audienceResolvedTargetAgentIds: ['a'],
        policyRoutableTargetAgentIds: [],
      }),
    ).toBe(true);
  });

  it('false when routable non-empty', () => {
    expect(
      isMainRoomAudiencePolicyBlockingAutoHandoff({
        intentType: 'audience_resolution',
        audienceResolvedTargetAgentIds: ['a'],
        policyRoutableTargetAgentIds: ['a'],
      }),
    ).toBe(false);
  });

  it('false for non-audience intent', () => {
    expect(
      isMainRoomAudiencePolicyBlockingAutoHandoff({
        intentType: 'direct_summon',
        audienceResolvedTargetAgentIds: ['a'],
        policyRoutableTargetAgentIds: [],
      }),
    ).toBe(false);
  });
});

describe('mainRoomAudiencePolicyBlocksAutoHandoffFromIntent', () => {
  it('delegates to policy helper', () => {
    expect(
      mainRoomAudiencePolicyBlocksAutoHandoffFromIntent({
        intentType: 'audience_resolution',
        mainRoomAudienceHandoff: { audienceResolvedTargetAgentIds: ['x'] },
        routingHints: { riskLevel: 'low', requiresParallelism: false, shouldExecute: false, responseMode: 'group_reply' },
      }),
    ).toBe(true);
  });
});
