import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import type { IntentDecision, RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type { RunMainRoomPostIntentRouteParams } from './collaboration-pipeline-v2.types.js';
import { runMainRoomPostIntentRouteCore } from './main-room-post-intent-route.util.js';

describe('runMainRoomPostIntentRouteCore', () => {
  const dispatchPlanPorts = {
    dispatchPlanV2Enabled: () => false,
    getDispatchPlanSession: jest.fn(async () => null),
  };

  const roomContext: RoomContext = {
    companyId: 'c1',
    roomId: 'r1',
    roomType: 'main',
    roomName: 'Main',
    organizationNodeId: null,
    members: [],
    memberDirectory: [],
    orgSnapshot: { departments: [], updatedAt: new Date().toISOString() },
  };

  function layerDecisionWithSummon(targetAgentIds: string[]): IntentDecision {
    return {
      traceId: 't1',
      roomType: 'main',
      intentType: 'direct_summon',
      confidence: 0.9,
      explanation: 'summon',
      targetDepartmentSlugs: [],
      targetLayer: 'orchestration',
      routingHints: {
        riskLevel: 'medium',
        shouldExecute: false,
        requiresParallelism: false,
        responseMode: 'direct_reply',
        targetAgentIds,
        explicitDirectTargets: true,
      },
    };
  }

  function baseParams(
    merged: RunMainRoomPostIntentRouteParams['mergedMainRoom'],
  ): RunMainRoomPostIntentRouteParams {
    return {
      input: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'm1',
        contentText: '@ops 请协助',
        ceoAgentId: 'ceo-1',
        mentionedAgentIds: [],
      } as RunMainRoomPostIntentRouteParams['input'],
      roomContext,
      traceId: 't1',
      mergedMainRoom: merged,
      intentDecision2026_1: {
        schemaVersion: '2026.1',
        traceId: 't1',
        roomId: 'r1',
        intentType: 'direct_summon',
        confidence: 0.9,
        routingHints: { riskLevel: 'medium', requiresParallelism: false, shouldExecute: false, suggestedDepartmentSlugs: [] },
        explanation: 'x',
      } as unknown as CollaborationIntentDecisionV20261,
      followupHintLine: null,
      memoryContext: { promptContext: '', hitCount: 0, memoryHits: [], duplicateSkipped: false },
    };
  }

  it('routes explicit_directed via router without assembling replay pack', async () => {
    const assembleReplayLlmContextPack = jest.fn();
    const routeMainRoomAfterIntent = jest.fn(async () => null);
    const out = await runMainRoomPostIntentRouteCore(
      {
        getMaxDirectTargets: () => 4,
        ...dispatchPlanPorts,
        isCeoReplayCollaborationEffective: jest.fn(async () => true),
        onReplayDisabled: jest.fn(),
        assembleReplayLlmContextPack,
        routeMainRoomAfterIntent,
      },
      baseParams({
        layerDecision: layerDecisionWithSummon(['ceo-1', 'ops-1']),
        authorizedHeavyExecution: false,
        routeIntentType: 'direct_summon',
        replayInvokeExecutionLayers: false,
      }),
    );
    expect(out.route.kind).toBe('explicit_directed');
    expect(out.assemblePackCalled).toBe(false);
    expect(out.routedViaRouter).toBe(true);
    expect(assembleReplayLlmContextPack).not.toHaveBeenCalled();
    expect(routeMainRoomAfterIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        replayLlmContextPack: expect.objectContaining({ memoryBlock: '', transcriptBlock: '', factsBlock: '' }),
      }),
      expect.any(Number),
      expect.objectContaining({ kind: 'explicit_directed' }),
    );
  });

  it('assembles replay pack only for ceo_replay_delegate', async () => {
    const assembleReplayLlmContextPack = jest.fn(async () => ({
      memoryBlock: 'mem',
      transcriptBlock: 'tx',
      factsBlock: '',
    }));
    const routeMainRoomAfterIntent = jest.fn(async () => null);
    const out = await runMainRoomPostIntentRouteCore(
      {
        getMaxDirectTargets: () => 4,
        ...dispatchPlanPorts,
        isCeoReplayCollaborationEffective: jest.fn(async () => true),
        onReplayDisabled: jest.fn(),
        assembleReplayLlmContextPack,
        routeMainRoomAfterIntent,
      },
      baseParams({
        layerDecision: layerDecisionWithSummon(['ceo-1']),
        authorizedHeavyExecution: false,
        routeIntentType: 'direct_summon',
        replayInvokeExecutionLayers: false,
      }),
    );
    expect(out.route.kind).toBe('ceo_replay_delegate');
    expect(out.assemblePackCalled).toBe(true);
    expect(assembleReplayLlmContextPack).toHaveBeenCalledTimes(1);
    expect(routeMainRoomAfterIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        replayLlmContextPack: expect.objectContaining({ memoryBlock: 'mem' }),
      }),
      expect.any(Number),
      expect.objectContaining({ kind: 'ceo_replay_delegate' }),
    );
  });

  it('returns early when replay disabled without calling router', async () => {
    const routeMainRoomAfterIntent = jest.fn();
    const onReplayDisabled = jest.fn(async () => ({ routePath: 'replay', handledByV2: true } as never));
    const out = await runMainRoomPostIntentRouteCore(
      {
        getMaxDirectTargets: () => 4,
        ...dispatchPlanPorts,
        isCeoReplayCollaborationEffective: jest.fn(async () => false),
        onReplayDisabled,
        assembleReplayLlmContextPack: jest.fn(),
        routeMainRoomAfterIntent,
      },
      baseParams({
        layerDecision: layerDecisionWithSummon(['ceo-1']),
        authorizedHeavyExecution: false,
        routeIntentType: 'direct_summon',
        replayInvokeExecutionLayers: false,
      }),
    );
    expect(out.routedViaRouter).toBe(false);
    expect(out.assemblePackCalled).toBe(false);
    expect(onReplayDisabled).toHaveBeenCalled();
    expect(routeMainRoomAfterIntent).not.toHaveBeenCalled();
  });
});
