jest.mock('../pipeline-v2/pipeline-v2.forward-ref.js', () => ({
  lazyCollaborationMainRoomIntentService: () => class CollaborationMainRoomIntentService {},
}));

import { CollaborationTurnService } from './collaboration-turn.service.js';

describe('CollaborationTurnService', () => {
  const config = {
    getCeoReplayModelName: () => 'test-model',
    getCollaborationMentionRpcTimeoutMs: () => 12000,
    getCeoReplayToolsAdjustedLlmTimeoutMs: (ms: number) => ms,
    isCollabMainRoomReplyBeforeHeavyEnabled: () => false,
  };
  const llmBridge = { createChatModel: jest.fn() };
  const ceoLayerConfigResolver = { resolveLayerSetting: jest.fn(async () => null) };
  const turnToolLoop = { run: jest.fn() };
  const directReply = { reply: jest.fn() };
  const programClient = { getActive: jest.fn(async () => null) };
  const orchestrateHandler = { orchestrate: jest.fn() };
  const ceoNaturalReply = { generateNaturalReply: jest.fn(async () => null) };
  const intent = {
    buildLegacyIntentDecisionFromUnifiedPipeline: jest.fn(() => ({
      intentType: 'ceo_reply',
      confidence: 0.9,
      metadata: {},
    })),
  };

  let service: CollaborationTurnService;

  beforeEach(() => {
    jest.clearAllMocks();
    llmBridge.createChatModel.mockResolvedValue({
      bind: () => ({ invoke: jest.fn() }),
    });
    service = new CollaborationTurnService(
      config as never,
      llmBridge as never,
      ceoLayerConfigResolver as never,
      turnToolLoop as never,
      directReply as never,
      programClient as never,
      orchestrateHandler as never,
      ceoNaturalReply as never,
      intent as never,
    );
  });

  it('mechanical orchestrate when user confirms but model skipped tool', async () => {
    turnToolLoop.run.mockResolvedValue({
      messages: [],
      telemetry: { roundsUsed: 1, toolCallsExecuted: 0, toolNames: [], orchestrationRan: false },
    });
    programClient.getActive.mockResolvedValue({
      id: 'p1',
      phase: 'aligning',
      goalUnderstanding: {
        summary: '化妆品未来用户付费意愿分析报告，受众营销团队',
        readiness: 'ready',
        source: 'llm_turn',
      },
      brief: { deliverableType: 'analysis_report', completeness: 1, missingFields: [] },
    });
    orchestrateHandler.orchestrate.mockResolvedValue({ ok: true, planId: 'plan-1' });

    const result = await service.run({
      input: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'm3',
        contentText: '确认执行',
        mentionedAgentIds: [],
        ceoAgentId: 'ceo1',
        userConfirmedExecution: true,
        confirmationIntent: 'confirm_execution',
      },
      roomContext: { roomType: 'main', collaborationMode: 'execution', memberDirectory: [], orgSnapshot: { departments: [] } } as never,
      intentDecision2026: {
        intentType: 'ceo_reply',
        confidence: 0.9,
        routingHints: {
          riskLevel: 'low',
          requiresParallelism: false,
          shouldExecute: true,
          responseMode: 'direct_reply',
        },
        explanation: '',
        traceId: 't3',
      } as never,
      intentDecision2026_1: {
        schemaVersion: '2026.2',
        intentType: 'ceo_reply',
        confidence: 0.9,
        routingHints: {
          riskLevel: 'low',
          requiresParallelism: false,
          shouldExecute: true,
          suggestedDepartmentSlugs: [],
        },
        explanation: '',
        traceId: 't3',
        roomId: 'r1',
      },
      traceId: 't3',
      memoryContext: { hitCount: 0 },
    });

    expect(orchestrateHandler.orchestrate).toHaveBeenCalled();
    expect(result.output.payload?.orchestrationRan).toBe(true);
  });

  it('returns collaboration_turn with roomWriteHandled when orchestrate was called', async () => {
    turnToolLoop.run.mockResolvedValue({
      messages: [],
      telemetry: { roundsUsed: 1, toolCallsExecuted: 1, toolNames: ['collaboration.orchestrate'], orchestrationRan: true },
    });

    const result = await service.run({
      input: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'm1',
        contentText: '直接编排下发化妆品报告',
        mentionedAgentIds: [],
        ceoAgentId: 'ceo1',
      },
      roomContext: { roomType: 'main', collaborationMode: 'execution', memberDirectory: [], orgSnapshot: { departments: [] } } as never,
      intentDecision2026: {
        intentType: 'ceo_reply',
        confidence: 0.9,
        routingHints: {
          riskLevel: 'low',
          requiresParallelism: false,
          shouldExecute: true,
          responseMode: 'direct_reply',
        },
        explanation: '',
        traceId: 't1',
      } as never,
      intentDecision2026_1: {
        schemaVersion: '2026.2',
        intentType: 'ceo_reply',
        confidence: 0.9,
        routingHints: {
          riskLevel: 'low',
          requiresParallelism: false,
          shouldExecute: true,
          suggestedDepartmentSlugs: [],
        },
        explanation: '',
        traceId: 't1',
        roomId: 'r1',
      },
      traceId: 't1',
      memoryContext: { hitCount: 0 },
    });

    expect(result.routePath).toBe('collaboration_turn');
    expect(result.output.payload?.roomWriteHandled).toBe(true);
    expect(result.output.payload?.orchestrationRan).toBe(true);
    expect(result.intentContract === 'unified_intent_v2026_1' && result.intentDecision2026_1?.collaborationTurn?.orchestrationRan).toBe(true);
    expect(directReply.reply).toHaveBeenCalled();
  });

  it('does not mark orchestrationRan for chat-only turn', async () => {
    turnToolLoop.run.mockResolvedValue({
      messages: [],
      telemetry: { roundsUsed: 1, toolCallsExecuted: 0, toolNames: [], orchestrationRan: false },
    });

    const result = await service.run({
      input: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'm2',
        contentText: '你好',
        mentionedAgentIds: [],
        ceoAgentId: 'ceo1',
      },
      roomContext: { roomType: 'main', collaborationMode: 'discussion', memberDirectory: [], orgSnapshot: { departments: [] } } as never,
      intentDecision2026: {
        intentType: 'ceo_reply',
        confidence: 0.9,
        routingHints: {
          riskLevel: 'low',
          requiresParallelism: false,
          shouldExecute: false,
          responseMode: 'direct_reply',
        },
        explanation: '',
        traceId: 't2',
      } as never,
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
        traceId: 't2',
        roomId: 'r1',
      },
      traceId: 't2',
      memoryContext: { hitCount: 0 },
    });

    expect(result.output.payload?.orchestrationRan).toBe(false);
    expect(
      result.intentContract === 'unified_intent_v2026_1' && result.intentDecision2026_1?.collaborationTurn?.orchestrationRan,
    ).toBe(false);
  });
});
