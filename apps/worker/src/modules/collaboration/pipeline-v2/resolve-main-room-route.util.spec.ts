import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import type { IntentDecision as CollaborationIntentDecision2026 } from '../contracts/collaboration-2026.contracts.js';
import { dispatchPlanHeavyAckText, resolveMainRoomRoute, userSummonedCeo } from './resolve-main-room-route.util.js';

function layerDecision(
  overrides?: Partial<CollaborationIntentDecision2026>,
): CollaborationIntentDecision2026 {
  return {
    traceId: 't1',
    intentType: 'unknown',
    confidence: 0.8,
    explanation: 'test',
    routingHints: {
      riskLevel: 'low',
      shouldExecute: false,
      requiresParallelism: false,
      responseMode: 'direct_reply',
    },
    ...overrides,
  } as CollaborationIntentDecision2026;
}

function unified(overrides?: Partial<CollaborationIntentDecisionV20261>): CollaborationIntentDecisionV20261 {
  return {
    traceId: 't1',
    intentType: 'unknown',
    confidence: 0.8,
    schemaVersion: '2026.2',
    routingHints: {},
    ...overrides,
  } as CollaborationIntentDecisionV20261;
}

describe('resolveMainRoomRoute', () => {
  it('explicit_directed when user @mentions in-room targets', () => {
    const route = resolveMainRoomRoute({
      userText: 'hello',
      layerDecision: layerDecision({
        intentType: 'audience_resolution',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
          targetAgentIds: ['a1'],
          explicitDirectTargets: true,
          summonProvenance: 'mention',
        },
      }),
      intentDecision2026_1: unified(),
      mentionedAgentIds: ['a1'],
      maxDirect: 4,
    });
    expect(route.kind).toBe('explicit_directed');
  });

  it('ceo_replay_delegate when audience LLM inferred targets without user summon', () => {
    const route = resolveMainRoomRoute({
      userText: '帮我做开发计划文档',
      layerDecision: layerDecision({
        intentType: 'audience_resolution',
        mainRoomAudienceHandoff: { audienceResolvedTargetAgentIds: ['director-product', 'director-eng'] },
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
          explicitDirectTargets: false,
          summonProvenance: 'audience_llm_uuid',
        },
        directorResolution: {
          status: 'matched',
          chosenAgentIds: [],
          candidateIdsBeforeFilter: ['director-product', 'director-eng'],
        },
      }),
      intentDecision2026_1: unified(),
      maxDirect: 4,
    });
    expect(route.kind).toBe('ceo_replay_delegate');
  });

  it('legacy: explicit_directed when explicitDirectTargets without handoff block', () => {
    const route = resolveMainRoomRoute({
      userText: 'hello',
      layerDecision: layerDecision({
        intentType: 'audience_resolution',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
          targetAgentIds: ['a1'],
          explicitDirectTargets: true,
        },
      }),
      intentDecision2026_1: unified(),
      maxDirect: 4,
    });
    expect(route.kind).toBe('explicit_directed');
  });

  it('@CEO in userText wins over explicit_directed', () => {
    const route = resolveMainRoomRoute({
      dispatchPlanV2Enabled: true,
      userText: '@CEO 请安排产品工程',
      layerDecision: layerDecision({
        intentType: 'audience_resolution',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: true,
          requiresParallelism: false,
          responseMode: 'execute_then_reply',
          targetAgentIds: ['director-product'],
          explicitDirectTargets: true,
        },
      }),
      intentDecision2026_1: unified(),
      ceoAgentId: 'ceo-1',
      maxDirect: 4,
    });
    expect(route.kind).toBe('ceo_replay_delegate');
  });

  it('userSummonedCeo detects @CEO in text without mention ids', () => {
    expect(userSummonedCeo({ userText: '@CEO 请下发', ceoAgentId: 'ceo-1' })).toBe(true);
  });

  it('@CEO mention wins over explicit_directed to directors', () => {
    const route = resolveMainRoomRoute({
      dispatchPlanV2Enabled: true,
      userText: '@CEO 请安排产品工程',
      layerDecision: layerDecision({
        intentType: 'audience_resolution',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: true,
          requiresParallelism: false,
          responseMode: 'execute_then_reply',
          targetAgentIds: ['director-product', 'director-engineering'],
          explicitDirectTargets: true,
        },
      }),
      intentDecision2026_1: unified(),
      ceoAgentId: 'ceo-1',
      mentionedAgentIds: ['ceo-1'],
      maxDirect: 4,
    });
    expect(route.kind).toBe('ceo_replay_delegate');
  });

  it('execution mode + v2 forces ceo_replay_delegate', () => {
    const route = resolveMainRoomRoute({
      dispatchPlanV2Enabled: true,
      userText: '开始执行',
      layerDecision: layerDecision({
        routingHints: {
          riskLevel: 'low',
          shouldExecute: true,
          requiresParallelism: false,
          responseMode: 'execute_then_reply',
          targetAgentIds: ['director-product'],
          explicitDirectTargets: true,
        },
      }),
      intentDecision2026_1: unified(),
      ceoAgentId: 'ceo-1',
      collaborationMode: 'execution',
      maxDirect: 4,
    });
    expect(route.kind).toBe('ceo_replay_delegate');
  });

  it('dispatch_plan_heavy on pending confirm flush', () => {
    const route = resolveMainRoomRoute({
      dispatchPlanV2Enabled: true,
      dispatchPlanSession: {
        version: 1,
        planId: 'p1',
        planRevision: 1,
        goal: 'g',
        bodyMarkdown: 'b',
        assignments: [],
        dispatched: false,
        pendingDistributionConfirm: true,
        pendingDistributionLegacy: { tasks: [{ taskId: 't1', department: 'product', deliverable: 'd' }] },
        sourceMessageId: 'm1',
        updatedAt: new Date().toISOString(),
      } as any,
      userText: '确认下发',
      userConfirmedDispatchFlush: true,
      layerDecision: layerDecision(),
      intentDecision2026_1: unified(),
      maxDirect: 4,
    });
    expect(route).toEqual({
      kind: 'dispatch_plan_heavy',
      heavyKind: 'dispatch_plan_compile_and_flush',
      ackText: dispatchPlanHeavyAckText('dispatch_plan_compile_and_flush'),
    });
  });

  it('userSummonedCeo detects mention list', () => {
    expect(
      userSummonedCeo({
        ceoAgentId: 'ceo-1',
        mentionedAgentIds: ['ceo-1', 'other'],
      }),
    ).toBe(true);
    expect(
      userSummonedCeo({
        ceoAgentId: 'ceo-1',
        routingTargetAgentIds: ['director-x'],
      }),
    ).toBe(false);
  });

  it('direct_summon_unresolved_surface when audience handoff attempted but no in-room targets', () => {
    const route = resolveMainRoomRoute({
      userText: '让工程主管说说',
      layerDecision: layerDecision({
        intentType: 'audience_resolution',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'group_reply',
          explicitDirectTargets: false,
        },
        directorResolution: {
          status: 'none',
          chosenAgentIds: [],
          candidateIdsBeforeFilter: ['agent-outside-whitelist'],
        },
      }),
      intentDecision2026_1: unified(),
      maxDirect: 4,
    });
    expect(route.kind).toBe('direct_summon_unresolved_surface');
  });
});
