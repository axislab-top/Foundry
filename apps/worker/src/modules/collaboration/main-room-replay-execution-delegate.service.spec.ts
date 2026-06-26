import { AIMessage } from '@langchain/core/messages';
import { MainRoomReplayExecutionDelegateService } from './main-room-replay-execution-delegate.service.js';

describe('MainRoomReplayExecutionDelegateService', () => {
  const baseDiagnostics = {
    syncedCompanyProfileChars: 0,
    speakerChars: 10,
    roomRosterChars: 0,
    factsChars: 0,
    orgSnapshotChars: 0,
    cortexCoreChars: 0,
    companyMemoryFactsChars: 0,
    transcriptChars: 20,
    memoryChars: 0,
    truncation: {
      profile: false,
      roomRoster: false,
      orgSnapshot: false,
      cortexCore: false,
      companyMemoryFacts: false,
    },
    factLayerMode: 'minimal_tools' as const,
    prefetchBlocks: ['speaker', 'transcript'],
  };

  function makeSvc(opts?: {
    toolsEnabled?: boolean;
    toolLoopOut?: { messages: unknown[]; telemetry: { roundsUsed: number; toolCallsExecuted: number; toolNames: string[] } };
  }) {
    const config = {
      shouldUseCeoDispatchPlanPath: () => false,
      getCollaborationMentionRpcTimeoutMs: jest.fn(() => 8000),
      getCeoReplayModelName: jest.fn(() => 'gpt-test'),
      isCeoReplayToolsEnabled: jest.fn(() => opts?.toolsEnabled ?? false),
      getCeoReplayToolsAdjustedLlmTimeoutMs: jest.fn((ms: number) => ms + 5000),
      getCeoReplayToolsMaxRounds: jest.fn(() => 2),
      getCeoReplayToolsMaxCallsPerRound: jest.fn(() => 2),
    } as any;
    const llmBridge = {
      createChatModel: jest.fn().mockResolvedValue({
        invoke: jest.fn().mockResolvedValue(
          new AIMessage(
            JSON.stringify({
              invokeExecutionLayers: false,
              userSurfaceText: '在的，有什么可以帮你？',
              draftGoalSummary: null,
              clearDraftSession: false,
            }),
          ),
        ),
      }),
    };
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn().mockResolvedValue({ modelName: 'gpt-test', maxTokens: 700, temperature: 0.25 }),
    };
    const ceoLayerTools = {
      build: jest.fn().mockResolvedValue({ tools: [], configuredSkillIds: [] }),
    };
    const replayToolLoop = {
      run: jest.fn().mockResolvedValue(
        opts?.toolLoopOut ?? {
          messages: [
            { _getType: () => 'system' },
            { _getType: () => 'human' },
            { _getType: () => 'ai', content: 'tool result summary' },
          ],
          telemetry: { roundsUsed: 1, toolCallsExecuted: 1, toolNames: ['facts.company.query'] },
        },
      ),
    };
    const sequentialPeerIntroSession = {
      isSessionActive: jest.fn().mockResolvedValue(false),
      pickNextDirector: jest.fn().mockResolvedValue(null),
      activateSession: jest.fn().mockResolvedValue(undefined),
    };
    const peerSummonDirect = {
      summonDirectorInMainRoom: jest.fn().mockResolvedValue({ ok: true, summonAccepted: true }),
    };
    const svc = new MainRoomReplayExecutionDelegateService(
      config,
      llmBridge as any,
      ceoLayerConfigResolver as any,
      ceoLayerTools as any,
      replayToolLoop as any,
      sequentialPeerIntroSession as any,
      peerSummonDirect as any,
    );
    return { svc, config, llmBridge, replayToolLoop, sequentialPeerIntroSession, peerSummonDirect };
  }

  it('returns parsed delegate decision on single-shot path', async () => {
    const { svc } = makeSvc();
    const out = await svc.evaluate({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm1',
      traceId: 't1',
      userText: '在吗',
      ceoAgentId: 'ceo-1',
      existingDraft: null,
      replayFactLayerSerialized: '【用户原话上下文】',
      replayFactLayerDiagnostics: baseDiagnostics,
    });
    expect(out.invokeExecutionLayers).toBe(false);
    expect(out.userSurfaceText).toContain('在的');
  });

  it('runs tool loop when tools enabled and toolPolicy allows tools', async () => {
    const { svc, replayToolLoop } = makeSvc({ toolsEnabled: true });
    await svc.evaluate({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm2',
      traceId: 't2',
      userText: '公司有哪些部门',
      ceoAgentId: 'ceo-1',
      existingDraft: null,
      replayFactLayerSerialized: '',
      replayFactLayerDiagnostics: baseDiagnostics,
      toolPolicy: 'tools_allowed',
    });
    expect(replayToolLoop.run).toHaveBeenCalled();
  });

  it('skips tool loop when fact layer already satisfies grounding plan', async () => {
    const { svc, replayToolLoop } = makeSvc({ toolsEnabled: true });
    await svc.evaluate({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm4',
      traceId: 't4',
      userText: '你好',
      ceoAgentId: 'ceo-1',
      existingDraft: null,
      replayFactLayerSerialized: '【组织部门事实】\n- 产品部',
      replayFactLayerDiagnostics: {
        ...baseDiagnostics,
        prefetchBlocks: ['speaker', 'transcript', 'org_snapshot'],
      },
      toolPolicy: 'tools_allowed',
      groundingPlan: {
        prefetchBlocks: ['speaker', 'transcript', 'org_snapshot'],
        factsQueryTypes: [],
        toolPolicy: 'tools_allowed',
        confidence: 0.9,
        source: 'llm',
      },
    });
    expect(replayToolLoop.run).not.toHaveBeenCalled();
  });
});
