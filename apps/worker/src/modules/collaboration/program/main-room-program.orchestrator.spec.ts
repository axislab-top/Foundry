jest.mock('../pipeline-v2/pipeline-v2.forward-ref.js', () => ({
  lazyCollaborationMainRoomIntentService: () => class CollaborationMainRoomIntentService {},
  lazyCollaborationMainRoomOrchestrationService: () => class CollaborationMainRoomOrchestrationService {},
}));

import type {
  CollaborationIntentDecisionV20261,
  CollaborationProgramRecord,
  DeliverableBrief,
} from '@contracts/types';
import { emptyDeliverableBrief } from '@contracts/types';
import { MainRoomProgramOrchestrator } from './main-room-program.orchestrator.js';
import type { RoomContext, IntentDecision } from '../contracts/collaboration-2026.contracts.js';
import type { CollaborationPipelineV2RunInput } from '../pipeline-v2/collaboration-pipeline-v2.types.js';
import { buildMergedBriefFromTurn } from './deliverable-brief.extractor.js';

function makeProgram(overrides: Partial<CollaborationProgramRecord> = {}): CollaborationProgramRecord {
  const t = new Date().toISOString();
  return {
    id: 'prog-1',
    companyId: 'c1',
    roomId: 'r1',
    threadId: 'main',
    sourceMessageId: 'msg-1',
    phase: 'aligning',
    brief: emptyDeliverableBrief('analysis_report'),
    lifecycle: 'awaiting_confirm',
    createdAt: t,
    updatedAt: t,
    ...overrides,
  };
}

function makeInput(contentText: string, messageId: string): CollaborationPipelineV2RunInput {
  return {
    companyId: 'c1',
    roomId: 'r1',
    threadId: 'main',
    messageId,
    contentText,
    ceoAgentId: 'ceo-1',
    humanSenderId: 'u1',
    messageCategory: null,
    messageMetadata: {},
  } as CollaborationPipelineV2RunInput;
}

const roomContext: RoomContext = {
  companyId: 'c1',
  roomId: 'r1',
  roomType: 'main',
  roomName: 'Main',
  organizationNodeId: null,
  members: [],
  memberDirectory: [],
  collaborationMode: 'discussion',
  orgSnapshot: { departments: [], updatedAt: new Date().toISOString() },
};

const intentDecision2026 = {
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
} as IntentDecision;

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
} as CollaborationIntentDecisionV20261;

describe('MainRoomProgramOrchestrator cosmetics report E2E', () => {
  let programStore: CollaborationProgramRecord | null;
  let config: {
    isCollabProgramSsotEnabled: () => boolean;
    getCollabProgramConfirmMode: () => 'auto' | 'always';
  };
  let programClient: {
    getActive: jest.Mock;
    createIntake: jest.Mock;
    transition: jest.Mock;
  };
  let directReply: { reply: jest.Mock };
  let intent: { buildLegacyIntentDecisionFromUnifiedPipeline: jest.Mock };
  let orchestration: { runMainRoomDispatchPlanPath: jest.Mock };
  let orchestrator: MainRoomProgramOrchestrator;

  beforeEach(() => {
    programStore = null;
    config = {
      isCollabProgramSsotEnabled: () => true,
      getCollabProgramConfirmMode: () => 'auto',
    };
    programClient = {
      getActive: jest.fn(async () => programStore),
      createIntake: jest.fn(async (params: { brief: DeliverableBrief; sourceMessageId: string }) => {
        programStore = makeProgram({
          phase: 'intake',
          sourceMessageId: params.sourceMessageId,
          brief: params.brief,
        });
        return programStore;
      }),
      transition: jest.fn(
        async (params: {
          programId: string;
          toPhase: CollaborationProgramRecord['phase'];
          patch?: Partial<Pick<CollaborationProgramRecord, 'brief' | 'metadata'>>;
        }) => {
          if (!programStore) throw new Error('no program');
          programStore = {
            ...programStore,
            ...params.patch,
            phase: params.toPhase,
            brief: params.patch?.brief ?? programStore.brief,
            updatedAt: new Date().toISOString(),
          };
          return programStore;
        },
      ),
    };
    directReply = { reply: jest.fn(async () => undefined) };
    intent = {
      buildLegacyIntentDecisionFromUnifiedPipeline: jest.fn(() => ({
        intentType: 'orchestration',
        confidence: 0.9,
        routingHints: { shouldExecute: true },
      })),
    };
    orchestration = {
      runMainRoomDispatchPlanPath: jest.fn(async () => ({
        intentContract: 'unified_intent_v2026_1',
        routePath: 'dispatch_plan_flush',
        intentDecision: { intentType: 'orchestration' },
        intentDecision2026_1,
        handledByV2: true,
        output: {
          status: 'ok',
          message: 'dispatched',
          payload: { dispatchAssignedCount: 1 },
        },
      })),
    };
    orchestrator = new MainRoomProgramOrchestrator(
      config as any,
      programClient as any,
      directReply as any,
      intent as any,
      orchestration as any,
      { syncToExecutionIfEnabled: jest.fn(async () => undefined) } as any,
    );
  });

  it('runs intake → aligning → planning → dept_executing for cosmetics report scenario', async () => {
    const msg1 = '我想要做一个关于化妆品未来大家是否愿意付费做一个分析报告';
    const turn1 = await orchestrator.run({
      input: makeInput(msg1, 'msg-1'),
      roomContext,
      intentDecision2026,
      intentDecision2026_1,
      traceId: 't1',
    });

    expect(turn1).not.toBeNull();
    expect(programStore?.phase).toBe('aligning');
    expect(programClient.createIntake).toHaveBeenCalled();
    expect(directReply.reply).toHaveBeenCalled();

    const msg2 =
      '报告受众营销团队、未来范围是1年、目标画像全人群、核心目的寻找增长点';
    const turn2 = await orchestrator.run({
      input: makeInput(msg2, 'msg-2'),
      roomContext,
      intentDecision2026,
      intentDecision2026_1,
      traceId: 't2',
    });

    expect(turn2).not.toBeNull();
    expect(orchestration.runMainRoomDispatchPlanPath).toHaveBeenCalled();
    expect(programStore?.phase).toBe('dept_executing');
    expect(programStore?.brief.audience).toContain('营销');
    expect(programStore?.brief.timeframe).toMatch(/1年/);
    expect(buildMergedBriefFromTurn({ userText: msg2, prior: programStore!.brief }).completeness).toBe(1);
    expect(turn2?.output?.payload).toEqual(
      expect.objectContaining({
        collaborationProgram: expect.objectContaining({ phase: 'dept_executing' }),
      }),
    );
  });

  it('routes complaint_gap to CEO without multi-director when brief incomplete', async () => {
    programStore = makeProgram({
      phase: 'aligning',
      brief: buildMergedBriefFromTurn({
        userText: '我想要做一个关于化妆品未来大家是否愿意付费做一个分析报告',
      }),
    });

    const turn = await orchestrator.run({
      input: makeInput('为什么没有报告', 'msg-complaint'),
      roomContext,
      intentDecision2026,
      intentDecision2026_1,
      traceId: 't3',
    });

    expect(turn).not.toBeNull();
    expect(directReply.reply).toHaveBeenCalled();
    expect(orchestration.runMainRoomDispatchPlanPath).not.toHaveBeenCalled();
    const replyArg = directReply.reply.mock.calls[0]?.[0] as { output?: { finalText?: string } };
    expect(String(replyArg?.output?.finalText ?? '')).toMatch(/缺|尚未派发|参数对齐/);
  });

  it('returns null when program SSOT disabled', async () => {
    config.isCollabProgramSsotEnabled = () => false;
    const turn = await orchestrator.run({
      input: makeInput('test message', 'msg-x'),
      roomContext,
      intentDecision2026,
      intentDecision2026_1,
      traceId: 't4',
    });
    expect(turn).toBeNull();
  });

  it('single message with full brief advances directly to dispatch', async () => {
    const msg =
      '请完成「化妆品未来用户付费意愿分析报告」：受众营销团队，时间范围 1 年，全人群画像，目的找增长点。直接编排下发。';
    const turn = await orchestrator.run({
      input: makeInput(msg, 'msg-single'),
      roomContext,
      intentDecision2026,
      intentDecision2026_1,
      traceId: 't5',
    });

    expect(turn).not.toBeNull();
    expect(orchestration.runMainRoomDispatchPlanPath).toHaveBeenCalled();
    expect(programStore?.phase).toBe('dept_executing');
    expect(turn?.routePath).toBe('dispatch_plan_flush');
    expect(turn?.output?.payload).toEqual(
      expect.objectContaining({
        collaborationProgram: expect.objectContaining({ phase: 'dept_executing' }),
      }),
    );
  });
});
