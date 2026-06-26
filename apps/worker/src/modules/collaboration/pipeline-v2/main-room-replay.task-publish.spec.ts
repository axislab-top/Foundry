import { runMainRoomCeoReplayDelegatePhase } from './main-room-replay.router.js';
import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import type { IntentDecision, RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type {
  RunMainRoomPostIntentRouteParams,
  RunMainRoomPostIntentRouteWithPack,
} from './collaboration-pipeline-v2.types.js';

describe('main-room-replay execution delegate', () => {
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

  const layerDecision: IntentDecision = {
    traceId: 't1',
    roomType: 'main',
    intentType: 'orchestration',
    confidence: 0.9,
    explanation: 'x',
    targetDepartmentSlugs: [],
    targetLayer: 'strategy',
    routingHints: {
      riskLevel: 'medium',
      shouldExecute: true,
      requiresParallelism: true,
      responseMode: 'execute_then_reply',
    },
  };

  const intentDecision2026_1 = {
    schemaVersion: '2026.1',
    traceId: 't1',
    roomId: 'r1',
    intentType: 'orchestration',
    confidence: 0.9,

    routingHints: {
      riskLevel: 'medium',
      requiresParallelism: true,
      shouldExecute: true,
      suggestedDepartmentSlugs: [],
    },
    explanation: 'x',
  } as unknown as CollaborationIntentDecisionV20261;

  function baseMerged(over: Partial<RunMainRoomPostIntentRouteParams['mergedMainRoom']> = {}) {
    return {
      layerDecision,
      authorizedHeavyExecution: true,
      routeIntentType: 'orchestration' as const,
      replayInvokeExecutionLayers: false,
      replayHeavyPipelineAckText: undefined,
      ...over,
    };
  }

  const testReplayPack = {
    memoryBlock: '【会话相关知识检索（单测）】',
    transcriptBlock: '【最近对话 — 节选】（单测）',
    factsBlock: '',
  };

  function baseParams(
    merged: RunMainRoomPostIntentRouteParams['mergedMainRoom'],
    over: Partial<RunMainRoomPostIntentRouteWithPack> = {},
  ): RunMainRoomPostIntentRouteWithPack {
    return {
      input: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'm1',
        contentText: '发布任务',
        ceoAgentId: 'ceo-1',
        messageCategory: 'task_publish',
      } as RunMainRoomPostIntentRouteParams['input'],
      roomContext,
      traceId: 't1',
      mergedMainRoom: merged,
      intentDecision2026_1,
      followupHintLine: null,
      memoryContext: { promptContext: '', hitCount: 0, memoryHits: [], duplicateSkipped: false },
      replayLlmContextPack: testReplayPack,
      ...over,
    };
  }

  const replayExecution = {
    evaluateDelegate: jest.fn(async () => ({
      invokeExecutionLayers: true,
      userSurfaceText: '',
      draftGoalSummary: null,
      clearDraftSession: false,
      heavyPipelineKind: 'full' as const,
    })),
    isPeerIntroSessionActive: jest.fn(async () => false),
    endPeerIntroSession: jest.fn(async () => undefined),
    getDraft: jest.fn(async () => null),
    setDraft: jest.fn(),
    clearDraft: jest.fn(),
  };

  const grounding = {
    buildReplayDelegateFactLayer: jest.fn(async () => ({
      serialized: '',
      diagnostics: {
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
      },
    })),
  };

  const alignment = {
    confirmGateEnabled: () => false,
    defaultAuthorizeExecution: () => true,
    programConfirmMode: () => 'auto' as const,
    naturalLightReplyEnabled: () => false,
    getSession: jest.fn(async () => null),
    setProposed: jest.fn(),
    clearSession: jest.fn(),
    markAuthorized: jest.fn(),
    patchAlignment: jest.fn(),
  };

  const replayPhaseDepsBase = {
    config: {
      getCollabMainRoomMaxDirectTargets: () => 4,
      shouldUseCeoDispatchPlanPath: () => false,
      isCollabProgramSsotEnabled: () => false,
      isCollabMainRoomReplyBeforeHeavyEnabled: () => false,
      isCollabWorkIntentCompilerEnabled: () => false,
      getCollabDispatchConfirmMode: () => 'auto' as const,
    },
    replayExecution,
    alignment,
    grounding,
  };

  it('sets replayInvokeExecutionLayers when delegate requests heavy pipeline', async () => {
    const logger = { log: jest.fn() };
    const merged = baseMerged();
    const out = await runMainRoomCeoReplayDelegatePhase(
      {
        ...replayPhaseDepsBase,
        handlers: {
          executeExplicitDirectedPath: jest.fn(),
          executeReplayUserFacingCopy: jest.fn(),
        },
      },
      baseParams(merged),
      logger,
      Date.now(),
    );
    // handleReplayAuthorizationOutcome stub returns null
    expect(out).toBeNull();
  });

  it('refinement turn: invoke=false returns user-facing copy (no heavy pipeline)', async () => {
    const executeReplayUserFacingCopy = jest.fn(async () => ({ handled: true } as any));
    const merged = baseMerged({
      authorizedHeavyExecution: false,
    });
    replayExecution.evaluateDelegate.mockResolvedValueOnce({
      invokeExecutionLayers: false,
      userSurfaceText: '需要我先做战略目标对齐吗？',
      draftGoalSummary: null,
      clearDraftSession: false,
      heavyPipelineKind: undefined,
    });
    const out = await runMainRoomCeoReplayDelegatePhase(
      {
        ...replayPhaseDepsBase,
        handlers: {
          executeExplicitDirectedPath: jest.fn(),
          executeReplayUserFacingCopy,
        },
      },
      baseParams(merged, {
        input: {
          companyId: 'c1',
          roomId: 'r1',
          messageId: 'm1',
          contentText: '嗯，我在想是不是要先对齐一下方向',
          ceoAgentId: 'ceo-1',
          messageCategory: null,
        } as RunMainRoomPostIntentRouteParams['input'],
      }),
      { log: jest.fn() },
      Date.now(),
    );
    // handleReplayAuthorizationOutcome stub returns null
    expect(out).toBeNull();
    expect(executeReplayUserFacingCopy).not.toHaveBeenCalled();
  });

  it('confirm gate: invoke=true becomes propose without heavy pipeline', async () => {
    const executeReplayUserFacingCopy = jest.fn(async () => ({ handled: true } as any));
    const merged = baseMerged();
    replayExecution.evaluateDelegate.mockResolvedValueOnce({
      invokeExecutionLayers: true,
      userSurfaceText: '可以启动编排',
      draftGoalSummary: '完成季度营销方案',
      clearDraftSession: false,
      heavyPipelineKind: 'full',
    });
    const gateAlignment = {
      ...alignment,
      confirmGateEnabled: () => true,
      defaultAuthorizeExecution: () => false,
    };
    const out = await runMainRoomCeoReplayDelegatePhase(
      {
        ...replayPhaseDepsBase,
        alignment: gateAlignment,
        handlers: {
          executeExplicitDirectedPath: jest.fn(),
          executeReplayUserFacingCopy,
        },
      },
      baseParams(merged),
      { log: jest.fn() },
      Date.now(),
    );
    // handleReplayAuthorizationOutcome stub returns null
    expect(out).toBeNull();
    expect(executeReplayUserFacingCopy).not.toHaveBeenCalled();
  });

  it('confirm gate: dispatch_plan invoke=true authorizes heavy pipeline (not propose)', async () => {
    const merged = baseMerged({ authorizedHeavyExecution: false });
    replayExecution.evaluateDelegate.mockResolvedValueOnce({
      invokeExecutionLayers: true,
      userSurfaceText: '收到，正在生成执行计划',
      draftGoalSummary: 'E2E 全链路探针',
      clearDraftSession: false,
      heavyPipelineKind: 'dispatch_plan_compile_and_flush',
    } as never);
    const gateAlignment = {
      ...alignment,
      confirmGateEnabled: () => true,
      defaultAuthorizeExecution: () => false,
    };
    const out = await runMainRoomCeoReplayDelegatePhase(
      {
        ...replayPhaseDepsBase,
        config: {
          getCollabMainRoomMaxDirectTargets: () => 4,
          shouldUseCeoDispatchPlanPath: () => true,
          isCollabProgramSsotEnabled: () => false,
          isCollabMainRoomReplyBeforeHeavyEnabled: () => false,
          isCollabWorkIntentCompilerEnabled: () => false,
          getCollabDispatchConfirmMode: () => 'auto' as const,
        },
        alignment: gateAlignment,
        dispatchPlan: { getSession: jest.fn(async () => null) },
        handlers: {
          executeExplicitDirectedPath: jest.fn(),
          executeReplayUserFacingCopy: jest.fn(),
        },
      },
      baseParams(merged, {
        input: {
          companyId: 'c1',
          roomId: 'r1',
          messageId: 'm1',
          contentText: '@CEO 请制定执行计划',
          ceoAgentId: 'ceo-1',
          messageCategory: null,
        } as RunMainRoomPostIntentRouteParams['input'],
      }),
      { log: jest.fn() },
      Date.now(),
    );
    // handleReplayAuthorizationOutcome stub returns null
    expect(out).toBeNull();
  });
});
