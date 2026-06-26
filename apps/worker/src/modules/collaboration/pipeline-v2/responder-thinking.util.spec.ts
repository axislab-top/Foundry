import { resolveEarlyThinkingFromRoute, resolveThinkingResponders } from './responder-thinking.util.js';

describe('resolveThinkingResponders', () => {
  const ceoId = '00000000-0000-4000-8000-000000000099';
  const directorId = '00000000-0000-4000-8000-000000000001';

  it('returns empty when inline reply handled', () => {
    expect(
      resolveThinkingResponders({
        routePath: 'orchestration',
        intentType: 'ceo_reply',
        ceoAgentId: ceoId,
        inlineReplyHandled: true,
      }),
    ).toEqual({ agentIds: [] });
  });

  it('returns target agents for direct audience route', () => {
    expect(
      resolveThinkingResponders({
        routePath: 'direct_agent',
        intentType: 'audience_resolution',
        ceoAgentId: ceoId,
        intentDecision2026: {
          schemaVersion: '2026.1',
          intentType: 'audience_resolution',
          confidence: 0.9,
          routingHints: {
            riskLevel: 'low',
            requiresParallelism: false,
            shouldExecute: false,
            suggestedDepartmentSlugs: [],
            targetAgentIds: [directorId],
            explicitDirectTargets: true,
          },
          explanation: 'test',
          traceId: 't1',
          roomId: 'r1',
        },
      }),
    ).toEqual({ agentIds: [directorId] });
  });

  it('returns CEO with L2 for orchestration', () => {
    expect(
      resolveThinkingResponders({
        routePath: 'orchestration',
        intentType: 'orchestration',
        ceoAgentId: ceoId,
      }),
    ).toEqual({ agentIds: [ceoId], ceoLayer: 'L2' });
  });

  it('returns CEO with L1 for strategy route', () => {
    expect(
      resolveThinkingResponders({
        routePath: 'strategy_goal_draft',
        intentType: 'strategy',
        ceoAgentId: ceoId,
      }),
    ).toEqual({ agentIds: [ceoId], ceoLayer: 'L1' });
  });

  it('returns CEO with L3 for approval route', () => {
    expect(
      resolveThinkingResponders({
        routePath: 'approval',
        intentType: 'approval',
        ceoAgentId: ceoId,
      }),
    ).toEqual({ agentIds: [ceoId], ceoLayer: 'L3' });
  });
});

describe('resolveEarlyThinkingFromRoute', () => {
  const ceoId = '00000000-0000-4000-8000-000000000099';
  const directorId = '00000000-0000-4000-8000-000000000001';

  it('returns direct targets for explicit_directed', () => {
    expect(
      resolveEarlyThinkingFromRoute({
        routeKind: 'explicit_directed',
        ceoAgentId: ceoId,
        directTargetIds: [directorId],
      }),
    ).toEqual({ agentIds: [directorId] });
  });

  it('returns CEO L2 for ceo_replay_delegate', () => {
    expect(
      resolveEarlyThinkingFromRoute({
        routeKind: 'ceo_replay_delegate',
        ceoAgentId: ceoId,
      }),
    ).toEqual({ agentIds: [ceoId], ceoLayer: 'L2' });
  });

  it('returns CEO L1 for dispatch_plan_heavy', () => {
    expect(
      resolveEarlyThinkingFromRoute({
        routeKind: 'dispatch_plan_heavy',
        ceoAgentId: ceoId,
      }),
    ).toEqual({ agentIds: [ceoId], ceoLayer: 'L1' });
  });

  it('returns empty when CEO missing', () => {
    expect(
      resolveEarlyThinkingFromRoute({
        routeKind: 'ceo_replay_delegate',
        ceoAgentId: null,
      }),
    ).toEqual({ agentIds: [] });
  });
});
