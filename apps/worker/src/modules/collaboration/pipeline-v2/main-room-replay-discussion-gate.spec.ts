import { runMainRoomCeoReplayDelegatePhase } from './main-room-replay.router.js';
import type {
  CollaborationIntentDecisionV20261,
  IntentDecision as PipelineIntentDecision,
} from '@contracts/types';
import type { IntentDecision, RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type { RunMainRoomPostIntentRouteWithPack } from './collaboration-pipeline-v2.types.js';

describe('runMainRoomCeoReplayDelegatePhase discussion gate', () => {
  const alignmentPorts = {
    confirmGateEnabled: () => true,
    defaultAuthorizeExecution: () => true,
    programConfirmMode: () => 'auto' as const,
    naturalLightReplyEnabled: () => false,
    getSession: jest.fn(async () => null),
    setProposed: jest.fn(),
    clearSession: jest.fn(),
    markAuthorized: jest.fn(),
    patchAlignment: jest.fn(),
  };

  const roomContextDiscussion: RoomContext = {
    companyId: 'c1',
    roomId: 'r1',
    roomType: 'main',
    roomName: 'Main',
    organizationNodeId: null,
    members: [],
    memberDirectory: [],
    collaborationMode: 'discussion',
    orgSnapshot: {
      departments: [],
      updatedAt: new Date().toISOString(),
    },
  };

  const intentDecision2026_1 = {
    schemaVersion: '2026.1',
    traceId: 't1',
    roomId: 'r1',
    intentType: 'ceo_reply',
    confidence: 0.9,
    routingHints: {
      riskLevel: 'medium',
      requiresParallelism: false,
      shouldExecute: false,
      suggestedDepartmentSlugs: [],
    },
    explanation: 'x',
  } as unknown as CollaborationIntentDecisionV20261;

  const pipelineIntentDecision: PipelineIntentDecision = {
    schemaVersion: '1.0',
    traceId: 't1',
    roomId: 'r1',
    requestedBy: 'u1',
    intentType: 'strategy',
    confidence: 0.9,
    explanation: 'ceo',
    routingHints: {
      riskLevel: 'medium',
      requiresParallelism: false,
    },
  };

  const layerDecision: IntentDecision = {
    traceId: 't1',
    roomType: 'main',
    intentType: 'ceo_reply',
    confidence: 0.9,
    explanation: 'ceo',
    targetDepartmentSlugs: [],
    targetLayer: null,
    routingHints: {
      riskLevel: 'medium',
      shouldExecute: false,
      requiresParallelism: false,
      responseMode: 'direct_reply',
      targetAgentIds: [],
      explicitDirectTargets: false,
    },
  };

  const emptyReplayDiagnostics = {
    syncedCompanyProfileChars: 0,
    speakerChars: 0,
    roomRosterChars: 0,
    factsChars: 0,
    orgSnapshotChars: 0,
    cortexCoreChars: 0,
    companyMemoryFactsChars: 0,
    transcriptChars: 0,
    memoryChars: 0,
    truncation: {
      profile: false,
      roomRoster: false,
      orgSnapshot: false,
      cortexCore: false,
      companyMemoryFacts: false,
    },
    factLayerMode: 'full_prefetch' as const,
    prefetchBlocks: ['speaker', 'transcript'],
  };

  it('honors delegate invoke=true in discussion mode (no server-side suppression)', async () => {
    const evaluateDelegate = jest.fn(async () => ({
      invokeExecutionLayers: true,
      userSurfaceText: '好的，推进中',
      draftGoalSummary: '测试目标',
      clearDraftSession: false,
      heavyPipelineKind: 'full' as const,
    }));
    const executeReplayUserFacingCopy = jest.fn(async () => ({
      intentContract: 'unified_intent_v2026_1' as const,
      routePath: 'strategy' as const,
      intentDecision: pipelineIntentDecision,
      intentDecision2026_1,
      handledByV2: true,
      output: {
        status: 'ok' as const,
        message: 'ok',
        payload: { deferHeavyPipeline: true },
      },
    }));
    const markAuthorized = jest.fn();
    const setProposed = jest.fn();

    const params: RunMainRoomPostIntentRouteWithPack = {
      input: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'm1',
        contentText: '请执行',
        ceoAgentId: 'ceo-1',
        messageCategory: null,
        humanSenderId: 'u1',
      } as RunMainRoomPostIntentRouteWithPack['input'],
      roomContext: roomContextDiscussion,
      traceId: 't1',
      mergedMainRoom: {
        layerDecision,
        authorizedHeavyExecution: false,
        routeIntentType: 'ceo_reply',
        replayInvokeExecutionLayers: false,
      } as RunMainRoomPostIntentRouteWithPack['mergedMainRoom'],
      intentDecision2026_1,
      followupHintLine: null,
      memoryContext: { promptContext: '', hitCount: 0, memoryHits: [], duplicateSkipped: false },
      replayLlmContextPack: {
        memoryBlock: '',
        transcriptBlock: '',
        factsBlock: '',
      },
    };

    await runMainRoomCeoReplayDelegatePhase(
      {
        config: {
          getCollabMainRoomMaxDirectTargets: () => 4,
          shouldUseCeoDispatchPlanPath: () => false,
          isCollabProgramSsotEnabled: () => false,
          isCollabMainRoomReplyBeforeHeavyEnabled: () => true,
          isCollabWorkIntentCompilerEnabled: () => false,
          getCollabDispatchConfirmMode: () => 'auto' as const,
        },
        alignment: { ...alignmentPorts, markAuthorized, setProposed },
        replayExecution: {
          evaluateDelegate,
          isPeerIntroSessionActive: jest.fn(async () => false),
          endPeerIntroSession: jest.fn(async () => undefined),
          getDraft: jest.fn(async () => null),
          setDraft: jest.fn(),
          clearDraft: jest.fn(),
        },
        grounding: {
          buildReplayDelegateFactLayer: jest.fn(async () => ({
            serialized: 'facts',
            diagnostics: emptyReplayDiagnostics,
          })),
        },
        handlers: {
          executeExplicitDirectedPath: jest.fn(),
          executeReplayUserFacingCopy,
        },
      },
      params,
      { log: jest.fn() },
      Date.now(),
    );

    expect(evaluateDelegate).toHaveBeenCalledWith(
      expect.objectContaining({ collaborationMode: 'discussion' }),
    );
    // handleReplayAuthorizationOutcome stub returns null - executeReplayUserFacingCopy not called
    expect(executeReplayUserFacingCopy).not.toHaveBeenCalled();
  });

  it('always runs delegate even when Ask surface generator is wired', async () => {
    const evaluateDelegate = jest.fn(async () => ({
      invokeExecutionLayers: false,
      userSurfaceText: '我们先对齐一下',
      draftGoalSummary: null,
      clearDraftSession: false,
    }));
    const buildReplayDelegateFactLayer = jest.fn(async () => ({
      serialized: 'should-not-run',
      diagnostics: emptyReplayDiagnostics,
    }));
    const generateAskDiscussionSurface = jest.fn(async () => 'natural 草案一段');
    const executeReplayUserFacingCopy = jest.fn(async () => ({
      intentContract: 'unified_intent_v2026_1' as const,
      routePath: 'strategy' as const,
      intentDecision: pipelineIntentDecision,
      intentDecision2026_1,
      handledByV2: true,
      output: { status: 'ok' as const, message: 'ok' },
    }));

    const params: RunMainRoomPostIntentRouteWithPack = {
      input: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'm1',
        contentText: '帮我写一份商业计划书大纲',
        ceoAgentId: 'ceo-1',
        messageCategory: null,
        humanSenderId: 'u1',
      } as RunMainRoomPostIntentRouteWithPack['input'],
      roomContext: roomContextDiscussion,
      traceId: 't1',
      mergedMainRoom: {
        layerDecision,
        authorizedHeavyExecution: false,
        routeIntentType: 'ceo_reply',
        replayInvokeExecutionLayers: false,
      } as RunMainRoomPostIntentRouteWithPack['mergedMainRoom'],
      intentDecision2026_1,
      followupHintLine: null,
      memoryContext: { promptContext: '', hitCount: 0, memoryHits: [], duplicateSkipped: false },
      replayLlmContextPack: {
        memoryBlock: '',
        transcriptBlock: '',
        factsBlock: '',
      },
    };

    await runMainRoomCeoReplayDelegatePhase(
      {
        config: {
          getCollabMainRoomMaxDirectTargets: () => 4,
          shouldUseCeoDispatchPlanPath: () => false,
          isCollabProgramSsotEnabled: () => false,
          isCollabMainRoomReplyBeforeHeavyEnabled: () => false,
          isCollabWorkIntentCompilerEnabled: () => false,
          getCollabDispatchConfirmMode: () => 'auto' as const,
        },
        alignment: alignmentPorts,
        generateAskDiscussionSurface,
        replayExecution: {
          evaluateDelegate,
          isPeerIntroSessionActive: jest.fn(async () => false),
          endPeerIntroSession: jest.fn(async () => undefined),
          getDraft: jest.fn(async () => null),
          setDraft: jest.fn(),
          clearDraft: jest.fn(),
        },
        grounding: { buildReplayDelegateFactLayer },
        handlers: {
          executeExplicitDirectedPath: jest.fn(),
          executeReplayUserFacingCopy,
        },
      },
      params,
      { log: jest.fn() },
      Date.now(),
    );

    expect(generateAskDiscussionSurface).not.toHaveBeenCalled();
    expect(evaluateDelegate).toHaveBeenCalled();
    expect(buildReplayDelegateFactLayer).toHaveBeenCalled();
    // handleReplayAuthorizationOutcome stub returns null - executeReplayUserFacingCopy not called
    expect(executeReplayUserFacingCopy).not.toHaveBeenCalled();
  });
});
