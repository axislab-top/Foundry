jest.mock('../pipeline-v2/pipeline-v2.forward-ref.js', () => ({

  lazyCollaborationMainRoomIntentService: () => class CollaborationMainRoomIntentService {},

  lazyCollaborationMainRoomOrchestrationService: () => class CollaborationMainRoomOrchestrationService {},

}));



import { CollaborationOrchestrateToolHandler } from './collaboration-orchestrate-tool.handler.js';

import type { CollaborationTurnToolContext } from './collaboration-turn-tool.types.js';



function baseCtx(): CollaborationTurnToolContext {

  return {

    companyId: 'c1',

    roomId: 'r1',

    threadId: 'main',

    traceId: 't1',

    messageId: 'm1',

    ceoAgentId: 'ceo1',

    humanSenderId: 'u1',

    input: {

      companyId: 'c1',

      roomId: 'r1',

      messageId: 'm1',

      contentText: '确认执行',

      mentionedAgentIds: [],

      ceoAgentId: 'ceo1',

    },

    roomContext: {

      roomType: 'main',

      collaborationMode: 'execution',

      memberDirectory: [],

      orgSnapshot: { departments: [] },

    } as CollaborationTurnToolContext['roomContext'],

    intentDecision2026: {

      intentType: 'ceo_reply',

      confidence: 0.9,

      targetDepartmentSlugs: [],

      routingHints: {

        riskLevel: 'low',

        requiresParallelism: false,

        shouldExecute: false,

        responseMode: 'direct_reply',

      },

      explanation: '',

      traceId: 't1',

    } as CollaborationTurnToolContext['intentDecision2026'],

    intentDecision2026_1: {

      schemaVersion: '2026.2',

      intentType: 'ceo_reply',

      confidence: 0.9,

      routingHints: {

        riskLevel: 'low',

        requiresParallelism: false,

        shouldExecute: false,

        suggestedDepartmentSlugs: [],

      },

      explanation: '',

      traceId: 't1',

      roomId: 'r1',

    },

    collaborationMode: 'execution',

  };

}



describe('CollaborationOrchestrateToolHandler', () => {

  const programClient = {

    getActive: jest.fn(),

    createIntake: jest.fn(),

    transition: jest.fn(),

  };

  const orchestration = {

    buildLegacyIntentDecisionForMainRoomPlanning: jest.fn(() => ({ intentType: 'orchestration' })),

    runMainRoomDispatchPlanPath: jest.fn(),

  };

  const intent = {};

  const config = { isCollabProgramSsotEnabled: () => true };

  const roomModeSync = { syncToExecutionIfEnabled: jest.fn(async () => undefined) };

  const dispatchFollowup = {

    applyDispatchOutcome: jest.fn(async () => ({

      ack: '已生成跨部门执行计划。',

      success: true,

      assignedCount: 2,

    })),

  };



  let handler: CollaborationOrchestrateToolHandler;



  beforeEach(() => {

    jest.clearAllMocks();

    handler = new CollaborationOrchestrateToolHandler(

      config as never,

      programClient as never,

      roomModeSync as never,

      orchestration as never,

      intent as never,

      dispatchFollowup as never,

    );

  });



  it('passes goalSummary as contentText to dispatch path, not raw confirm phrase', async () => {

    const goalSummary =

      '化妆品未来用户付费意愿分析报告：受众营销团队，时间范围1年，用户画像全人群，目的寻找增长点';

    programClient.getActive.mockResolvedValue({

      id: 'p1',

      phase: 'aligning',

      brief: { deliverableType: 'analysis_report', completeness: 1, missingFields: [] },

    });

    programClient.transition.mockResolvedValue({

      id: 'p1',

      phase: 'planning',

      goalUnderstanding: { summary: goalSummary, readiness: 'ready', source: 'llm_turn' },

      brief: { deliverableType: 'analysis_report', completeness: 1, missingFields: [] },

    });

    orchestration.runMainRoomDispatchPlanPath.mockResolvedValue({

      routePath: 'dispatch_plan_flush',

      output: { status: 'ok', message: 'ok', payload: { planId: 'plan-1', deferDistributionFlush: true } },

    });



    const result = await handler.orchestrate(baseCtx(), { goalSummary, autoFlush: true });



    expect(result.ok).toBe(true);

    expect(result.assignmentCount).toBe(2);

    const call = orchestration.runMainRoomDispatchPlanPath.mock.calls[0]?.[0];

    expect(call.input.contentText).toBe(goalSummary);

    expect(call.input.contentText).not.toBe('确认执行');

  });



  it('syncs execution mode then orchestrates when room is discussion', async () => {

    const ctx = baseCtx();

    ctx.roomContext.collaborationMode = 'discussion';

    ctx.collaborationMode = 'discussion';

    programClient.getActive.mockResolvedValue(null);

    programClient.createIntake.mockResolvedValue({ id: 'p2', phase: 'intake', brief: {} });

    programClient.transition.mockResolvedValue({ id: 'p2', phase: 'planning', brief: {} });

    orchestration.runMainRoomDispatchPlanPath.mockResolvedValue({

      routePath: 'dispatch_plan_flush',

      output: { status: 'ok', message: 'ok', payload: {} },

    });



    const goalSummary = '需要一份完整的季度营销分析报告并派给各部门';

    const result = await handler.orchestrate(ctx, { goalSummary });



    expect(roomModeSync.syncToExecutionIfEnabled).toHaveBeenCalled();

    expect(result.ok).toBe(true);

    expect(orchestration.runMainRoomDispatchPlanPath).toHaveBeenCalled();

  });



  it('returns ok false when dispatch followup fails', async () => {

    programClient.getActive.mockResolvedValue({ id: 'p1', phase: 'planning', brief: {} });

    programClient.transition.mockResolvedValue({ id: 'p1', phase: 'planning', brief: {} });

    orchestration.runMainRoomDispatchPlanPath.mockResolvedValue({

      routePath: 'dispatch_plan_flush',

      output: { status: 'ok', message: 'ok', payload: {} },

    });

    dispatchFollowup.applyDispatchOutcome.mockResolvedValue({
      ack: '派发失败',
      success: false,
      errorCode: 'DISPATCH_ZERO_ASSIGN',
    } as never);



    const result = await handler.orchestrate(baseCtx(), {

      goalSummary: '需要一份完整的季度营销分析报告并派给各部门',

    });

    expect(result.ok).toBe(false);

    expect(result.error).toBe('DISPATCH_ZERO_ASSIGN');

  });

});


