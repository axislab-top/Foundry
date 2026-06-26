jest.mock('./pipeline-v2.forward-ref.js', () => ({
  lazyCollaborationPipelineV2Service: () => class CollaborationPipelineV2Service {},
  lazyCollaborationMainRoomFlowService: () => class CollaborationMainRoomFlowService {},
  lazyCollaborationMainRoomIntentService: () => class CollaborationMainRoomIntentService {},
  lazyCollaborationMainRoomSupervisionService: () => class CollaborationMainRoomSupervisionService {},
  lazyCollaborationMainRoomOrchestrationService: () => class CollaborationMainRoomOrchestrationService {},
  lazyCollaborationMainRoomReplayService: () => class CollaborationMainRoomReplayService {},
  lazyCollaborationPipelineRuleFallbackService: () => class CollaborationPipelineRuleFallbackService {},
}));

import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import { CollaborationMainRoomFlowService } from './main-room-flow.service.js';

function mainRoomContext(): RoomContext {
  return {
    companyId: 'c1',
    roomId: 'r1',
    roomType: 'main',
    roomName: 'Main',
    organizationNodeId: null,
    members: [],
    memberDirectory: [],
    orgSnapshot: { departments: [], updatedAt: new Date().toISOString() },
  };
}

function makeFlowService(deps: {
  orchestrationPause?: {
    isPaused: jest.Mock;
    pauseActiveOrchestration?: jest.Mock;
  };
  directReply?: { reply: jest.Mock };
  intentLayerService?: { recognizeIntent: jest.Mock };
  orchestration?: Record<string, jest.Mock>;
  config?: Record<string, unknown>;
  intent?: Record<string, jest.Mock>;
  collaborationTurn?: { run: jest.Mock };
  contextGroundingPlannerService?: { planGrounding: jest.Mock };
  memoryCrossCutService?: { persistAfterIntentClassified: jest.Mock };
  mainRoomDispatchPlanSession?: { getForRouting: jest.Mock };
}) {
  const config = {
    isCollabProgramLegacyRouterFallbackEnabled: () => false,
    isCollabTurnToolOrchestrationEnabled: () => true,
    isCollabMainRoomRouteSsotConvergedEnabled: () => false,
    isCollabProgramSsotEnabled: () => false,
    shouldUseCeoDispatchPlanPath: () => false,
    getCollabMainRoomMaxDirectTargets: () => 8,
    ...(deps.config ?? {}),
  } as any;
  const orchestrationPause = deps.orchestrationPause ?? {
    isPaused: jest.fn().mockResolvedValue(false),
    pauseActiveOrchestration: jest.fn(),
  };
  const directReply = deps.directReply ?? { reply: jest.fn().mockResolvedValue(undefined) };
  const intentLayerService = deps.intentLayerService ?? {
    recognizeIntent: jest.fn().mockResolvedValue({}),
  };
  const contextGroundingPlannerService = deps.contextGroundingPlannerService ?? {
    planGrounding: jest.fn().mockResolvedValue({ prefetchBlocks: [] }),
  };
  const memoryCrossCutService = deps.memoryCrossCutService ?? {
    persistAfterIntentClassified: jest.fn().mockResolvedValue(undefined),
  };
  const intent = deps.intent ?? {
    finalizeMainRoomIntentLayerState: jest.fn(),
    buildUnifiedIntentFromLayer: jest.fn(),
    applyMainRoomIntentSummonEnrichAndDirectorValidation: jest.fn().mockResolvedValue(undefined),
  };
  const collaborationTurn = deps.collaborationTurn ?? { run: jest.fn() };
  const mainRoomDispatchPlanSession = deps.mainRoomDispatchPlanSession ?? {
    getForRouting: jest.fn().mockResolvedValue(null),
  };
  const orchestration = deps.orchestration ?? {
    buildLegacyIntentDecisionForMainRoomPlanning: jest.fn(),
    runMainRoomDispatchPlanPath: jest.fn(),
  };

  const mainRoomAudienceRoutingContext = {
    prepareMainRoomAudienceRoutingRecognizeContext: jest.fn().mockResolvedValue({
      memoryContext: { promptContext: '', hitCount: 0, memoryHits: [], duplicateSkipped: false },
      followupHintLine: null,
      roomMemberPromptBlock: '',
      audienceRoutingTurnText: '暂停编排',
      recentTranscriptDigest: null,
      audienceRoutingRecentTurnFacts: null,
      audienceRoutingMemoryDigest: null,
    }),
  };

  const flow = new CollaborationMainRoomFlowService(
    config,
    intentLayerService as any,
    contextGroundingPlannerService as any,
    memoryCrossCutService as any,
    { touchHeavyCollaborationLease: jest.fn() } as any,
    directReply as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    mainRoomDispatchPlanSession as any,
    {} as any,
    { patchTriggerPipelineProgress: jest.fn() } as any,
    {} as any,
    {} as any,
    mainRoomAudienceRoutingContext as any,
    {} as any,
    {} as any,
    intent as any,
    orchestration as any,
    {} as any,
    collaborationTurn as any,
    orchestrationPause as any,
    { getActive: jest.fn(async () => null) } as any,
    { isEnabled: () => false, syncWorkCommand: jest.fn() } as any,
    { isSessionActive: jest.fn(async () => false) } as any,
  );

  return {
    flow,
    orchestrationPause,
    directReply,
    intentLayerService,
    orchestration,
    collaborationTurn,
    intent,
  };
}

describe('CollaborationMainRoomFlowService', () => {
  it('runDeferredHeavyPipeline skips when orchestration paused', async () => {
    const orchestrationPause = {
      isPaused: jest.fn().mockResolvedValue(true),
      pauseActiveOrchestration: jest.fn(),
    };
    const { flow } = makeFlowService({ orchestrationPause });

    const out = await flow.runDeferredHeavyPipeline({
      input: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'm1',
        contentText: 'task',
        humanSenderId: 'u1',
        threadId: null,
      } as any,
      roomContext: mainRoomContext(),
      traceId: 'trace-1',
      heavyKind: 'dispatch_plan_compile_and_flush',
      intentDecision2026: {
        intentType: 'orchestration',
        confidence: 0.9,
        routingHints: { riskLevel: 'low', requiresParallelism: false, shouldExecute: true },
        targetDepartmentSlugs: [],
        explanation: 'x',
        traceId: 'trace-1',
      } as any,
      intentDecision2026_1: {
        schemaVersion: '2026.1',
        traceId: 'trace-1',
        roomId: 'r1',
        intentType: 'orchestration',
        confidence: 0.9,
        routingHints: { riskLevel: 'low', requiresParallelism: false, shouldExecute: true, suggestedDepartmentSlugs: [] },
        explanation: 'x',
      } as any,
    });

    expect(out.routePath).toBe('orchestration_paused');
    expect(out.output?.message).toBe('deferred_heavy_skipped_orchestration_paused');
    expect(orchestrationPause.isPaused).toHaveBeenCalled();
  });

  it('runMainRoomFlow handles orchestration pause before intent layer', async () => {
    const orchestrationPause = {
      isPaused: jest.fn(),
      pauseActiveOrchestration: jest.fn().mockResolvedValue({
        attempted: true,
        ok: true,
        revoke: false,
        mainGoalTaskId: 'goal-1',
      }),
    };
    const directReply = { reply: jest.fn().mockResolvedValue(undefined) };
    const intentLayerService = { recognizeIntent: jest.fn() };
    const { flow } = makeFlowService({
      orchestrationPause,
      directReply,
      intentLayerService,
    });

    const out = await flow.runMainRoomFlow({
      input: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'm1',
        contentText: '暂停编排',
        ceoAgentId: 'ceo-1',
        humanSenderId: 'u1',
        confirmationIntent: 'orchestration_pause',
        mentionedAgentIds: [],
        threadId: null,
      } as any,
      roomContext: mainRoomContext(),
    });

    expect(out.routePath).toBe('orchestration_paused');
    expect(orchestrationPause.pauseActiveOrchestration).toHaveBeenCalled();
    expect(directReply.reply).toHaveBeenCalled();
    expect(intentLayerService.recognizeIntent).not.toHaveBeenCalled();
  });

  it('legacy router fallback notifies onResponderThinking before post-intent', async () => {
    const layerDecision = {
      traceId: 'trace-1',
      intentType: 'orchestration',
      confidence: 0.85,
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: true,
        targetAgentIds: [],
      },
      targetDepartmentSlugs: [],
      explanation: 'legacy',
    };
    const merged = {
      layerDecision,
      replayHeavyPipelineKind: null,
      replayInvokeExecutionLayers: false,
      authorizedHeavyExecution: false,
    };
    const onResponderThinking = jest.fn();
    const { flow } = makeFlowService({
      config: {
        isCollabTurnToolOrchestrationEnabled: () => false,
        isCollabMainRoomRouteSsotConvergedEnabled: () => true,
      },
      intent: {
        finalizeMainRoomIntentLayerState: jest.fn().mockReturnValue(merged),
        applyMainRoomIntentSummonEnrichAndDirectorValidation: jest.fn().mockResolvedValue(undefined),
        buildUnifiedIntentFromLayer: jest.fn().mockReturnValue({
          schemaVersion: '2026.1',
          traceId: 'trace-1',
          roomId: 'r1',
          intentType: 'orchestration',
          confidence: 0.85,
          routingHints: {
            riskLevel: 'low',
            requiresParallelism: false,
            shouldExecute: true,
            suggestedDepartmentSlugs: [],
          },
          explanation: 'legacy',
        }),
      },
    });
    const postIntentSpy = jest.spyOn(flow, 'runMainRoomPostIntentRoute').mockResolvedValue({
      routePath: 'direct_agent',
      intentDecision: layerDecision as any,
      handledByV2: true,
      output: { status: 'ok', message: 'ok' },
    } as any);

    await flow.runMainRoomFlow({
      input: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'm-legacy',
        contentText: '请推进',
        ceoAgentId: 'ceo-1',
        humanSenderId: 'u1',
        mentionedAgentIds: [],
        threadId: null,
      } as any,
      roomContext: mainRoomContext(),
      onResponderThinking,
    });

    expect(onResponderThinking).toHaveBeenCalledWith(
      expect.objectContaining({ agentIds: ['ceo-1'], routePath: 'ceo_replay_delegate' }),
    );
    expect(onResponderThinking.mock.invocationCallOrder[0]).toBeLessThan(
      postIntentSpy.mock.invocationCallOrder[0] ?? 999,
    );
  });

  it('skips turn-tool when route SSOT converged and post-intent misses', async () => {
    const layerDecision = {
      traceId: 'trace-1',
      intentType: 'orchestration',
      confidence: 0.85,
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: true,
        targetAgentIds: [],
        explicitDirectTargets: false,
      },
      targetDepartmentSlugs: [],
      explanation: 'ssot',
    };
    const merged = {
      layerDecision,
      replayHeavyPipelineKind: null,
      replayInvokeExecutionLayers: false,
      authorizedHeavyExecution: false,
    };
    const collaborationTurn = { run: jest.fn() };
    const { flow } = makeFlowService({
      config: {
        isCollabTurnToolOrchestrationEnabled: () => true,
        isCollabMainRoomRouteSsotConvergedEnabled: () => true,
        shouldUseCeoDispatchPlanPath: () => false,
      },
      intent: {
        finalizeMainRoomIntentLayerState: jest.fn().mockReturnValue(merged),
        applyMainRoomIntentSummonEnrichAndDirectorValidation: jest.fn().mockResolvedValue(undefined),
        buildUnifiedIntentFromLayer: jest.fn().mockReturnValue({
          schemaVersion: '2026.1',
          traceId: 'trace-1',
          roomId: 'r1',
          intentType: 'orchestration',
          confidence: 0.85,
          routingHints: {
            riskLevel: 'low',
            requiresParallelism: false,
            shouldExecute: true,
            suggestedDepartmentSlugs: [],
          },
          explanation: 'ssot',
        }),
      },
      collaborationTurn,
    });
    jest.spyOn(flow, 'runMainRoomPostIntentRoute').mockResolvedValue(null);

    await flow.runMainRoomFlow({
      input: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'm-ssot',
        contentText: '请推进',
        ceoAgentId: 'ceo-1',
        humanSenderId: 'u1',
        mentionedAgentIds: [],
        threadId: null,
      } as any,
      roomContext: mainRoomContext(),
    });

    expect(collaborationTurn.run).not.toHaveBeenCalled();
  });
});
