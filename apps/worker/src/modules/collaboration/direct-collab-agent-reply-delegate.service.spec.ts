import { of } from 'rxjs';
import { DirectCollabAgentReplyDelegateService } from './direct-collab-agent-reply-delegate.service.js';
import type { ExecuteDirectCollabHandoverParams } from '../agents/direct-collab-reply-delegate.js';

function baseParams(overrides?: Partial<ExecuteDirectCollabHandoverParams>): ExecuteDirectCollabHandoverParams {
  return {
    companyId: 'c1',
    roomId: 'r1',
    messageId: 'm1',
    agentId: 'a-target',
    contentText: '请用 echo 回显 hello',
    intentDecision: { intentType: 'direct_agent', targetIds: ['a-target'] } as any,
    fastSingleAgentHandover: false,
    ...overrides,
  };
}

describe('DirectCollabAgentReplyDelegateService', () => {
  const stubHrStaffing = {
    isHrDirectorAgent: jest.fn(() => false),
    isStaffingSurveyIntent: jest.fn(() => false),
    execute: jest.fn(async () => ({ executed: false })),
  } as any;
  const stubTokenStream = {} as any;

  function makeSvc(
    deps: {
      config?: ReturnType<typeof makeConfig>;
      collabLlmBridge: any;
      memory?: any;
      layerResolver?: any;
      skillTools: any;
      skillLoop: any;
      apiRpc: any;
    },
  ) {
    return new DirectCollabAgentReplyDelegateService(
      deps.config ?? makeConfig(),
      deps.collabLlmBridge,
      deps.memory ?? { assembleForDirected: jest.fn(async () => ({ messages: [], auxiliarySystemText: '' })) },
      deps.layerResolver ?? { resolveLayerSetting: jest.fn(async () => ({ modelName: 'gpt-4o-mini' })) },
      deps.skillTools,
      deps.skillLoop,
      stubHrStaffing,
      stubTokenStream,
      deps.apiRpc,
    );
  }

  const makeConfig = (overrides?: Record<string, unknown>) =>
    ({
      getWorkerActorUserId: () => 'worker-1',
      getCollaborationMentionRpcTimeoutMs: () => 8_000,
      resolveCollabDirectReplyMaxOutputTokens: () => 2048,
      getCollabDirectReplyLengthContinuationMaxRounds: () => 2,
      getCollabDirectReplyVisibleTextHardCap: () => 48_000,
      isDirectAgentSkillsEnabled: () => true,
      getDirectAgentSkillsMaxRounds: () => 3,
      getDirectAgentSkillsMaxCallsPerRound: () => 4,
      getDirectAgentSkillsPromptMode: (fast: boolean) => (fast ? 'auto' : 'complete'),
      isCollabLlmTokenStreamingEnabled: () => false,
      isCollabDirectReplyStreamingEnabledForRoom: () => false,
      ...overrides,
    }) as any;

  it('uses skill tool loop when skill pack has tools', async () => {
    const bind = jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({ content: 'Skill path reply.' }),
    });
    const model = { bind, invoke: jest.fn() };
    const collabLlmBridge = {
      createChatModel: jest.fn(async () => model),
    };
    const agentDirectSkillTools = {
      build: jest.fn(async () => ({
        tools: [{ type: 'function', function: { name: 'echo', description: 'd', parameters: {} } }],
        allowedToolNames: new Set(['echo']),
        capabilitySkillIds: ['sk-1'],
        skillCatalog: [{ id: 'sk-1', name: 'echo', description: 'd', implementationType: 'prompt' }],
        boundMcpToolNames: [],
        skillCount: 1,
        usesToolCatalog: false,
        progressiveDisclosure: true,
      })),
    };
    const agentDirectSkillToolLoop = {
      run: jest.fn(async () => ({
        messages: [],
        telemetry: { roundsUsed: 1, toolCallsExecuted: 0, toolNames: [] },
        text: 'Skill path reply.',
      })),
    };

    const svc = new DirectCollabAgentReplyDelegateService(
      makeConfig(),
      collabLlmBridge as any,
      { assembleForDirected: jest.fn(async () => ({ messages: [], auxiliarySystemText: '' })) } as any,
      { resolveLayerSetting: jest.fn(async () => ({ modelName: 'gpt-4o-mini' })) } as any,
      agentDirectSkillTools as any,
      agentDirectSkillToolLoop as any,
      stubHrStaffing,
      stubTokenStream,
      {
        send: jest.fn((pattern: string) => {
          if (pattern === 'agents.findOne') return of({ id: 'a-target', name: 'Echo Bot', role: 'executor' });
          return of({});
        }),
      } as any,
    );

    const out = await svc.executeDirect(baseParams());
    expect(out?.text).toBe('Skill path reply.');
    expect(bind).toHaveBeenCalledWith(expect.objectContaining({ tool_choice: 'auto' }));
    expect(agentDirectSkillToolLoop.run).toHaveBeenCalled();
  });

  it('falls back to pure LLM when no skills bound', async () => {
    const invoke = jest.fn().mockResolvedValue({ content: 'Pure LLM.' });
    const collabLlmBridge = {
      createChatModel: jest.fn(async () => ({ invoke })),
    };
    const agentDirectSkillTools = {
      build: jest.fn(async () => ({
        tools: [],
        allowedToolNames: new Set(),
        capabilitySkillIds: [],
        skillCatalog: [],
        boundMcpToolNames: [],
        skillCount: 0,
        usesToolCatalog: false,
        progressiveDisclosure: true,
      })),
    };
    const agentDirectSkillToolLoop = { run: jest.fn() };

    const svc = new DirectCollabAgentReplyDelegateService(
      makeConfig(),
      collabLlmBridge as any,
      { assembleForDirected: jest.fn(async () => ({ messages: [], auxiliarySystemText: '' })) } as any,
      { resolveLayerSetting: jest.fn(async () => ({ modelName: 'gpt-4o-mini' })) } as any,
      agentDirectSkillTools as any,
      agentDirectSkillToolLoop as any,
      stubHrStaffing,
      stubTokenStream,
      {
        send: jest.fn((pattern: string) => {
          if (pattern === 'agents.findOne') return of({ id: 'a-target', name: 'Bot', role: 'executor' });
          return of({});
        }),
      } as any,
    );

    const out = await svc.executeDirect(baseParams());
    expect(out?.text).toBe('Pure LLM.');
    expect(invoke).toHaveBeenCalled();
    expect(agentDirectSkillToolLoop.run).not.toHaveBeenCalled();
  });

  it('fast handover still uses skill path when tools available', async () => {
    const bind = jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({ content: 'Fast skill.' }),
    });
    const collabLlmBridge = {
      createChatModel: jest.fn(async () => ({ bind })),
    };
    const agentDirectSkillTools = {
      build: jest.fn(async () => ({
        tools: [{ type: 'function', function: { name: 'echo', description: 'd', parameters: {} } }],
        allowedToolNames: new Set(['echo']),
        capabilitySkillIds: ['sk-1'],
        skillCatalog: [],
        boundMcpToolNames: [],
        skillCount: 1,
        usesToolCatalog: false,
        progressiveDisclosure: true,
      })),
    };
    const agentDirectSkillToolLoop = {
      run: jest.fn(async () => ({
        messages: [],
        telemetry: { roundsUsed: 1, toolCallsExecuted: 0, toolNames: [] },
        text: 'Fast skill.',
      })),
    };

    const svc = new DirectCollabAgentReplyDelegateService(
      makeConfig({
        getDirectAgentSkillsMaxRounds: (fast: boolean) => (fast ? 2 : 3),
        getDirectAgentSkillsMaxCallsPerRound: (fast: boolean) => (fast ? 2 : 4),
      }),
      collabLlmBridge as any,
      { assembleForDirected: jest.fn(async () => ({ messages: [], auxiliarySystemText: '' })) } as any,
      { resolveLayerSetting: jest.fn(async () => ({ modelName: 'gpt-4o-mini' })) } as any,
      agentDirectSkillTools as any,
      agentDirectSkillToolLoop as any,
      stubHrStaffing,
      stubTokenStream,
      {
        send: jest.fn((pattern: string) => {
          if (pattern === 'agents.findOne') return of({ id: 'a-target', name: 'Bot', role: 'executor' });
          return of({});
        }),
      } as any,
    );

    const out = await svc.executeDirect(baseParams({ fastSingleAgentHandover: true }));
    expect(out?.text).toBe('Fast skill.');
    expect(agentDirectSkillTools.build).toHaveBeenCalledWith(expect.objectContaining({ fast: true }));
    expect(agentDirectSkillToolLoop.run).toHaveBeenCalled();
  });

  it('continues generation when finish_reason is length and does not silent-slice', async () => {
    const invoke = jest
      .fn()
      .mockResolvedValueOnce({ content: '第一段', response_metadata: { finish_reason: 'length' } })
      .mockResolvedValueOnce({ content: '第二段', response_metadata: { finish_reason: 'stop' } });
    const collabLlmBridge = { createChatModel: jest.fn(async () => ({ invoke })) };
    const agentDirectSkillTools = {
      build: jest.fn(async () => ({
        tools: [],
        allowedToolNames: new Set(),
        capabilitySkillIds: [],
        skillCatalog: [],
        boundMcpToolNames: [],
        skillCount: 0,
        usesToolCatalog: false,
        progressiveDisclosure: true,
      })),
    };

    const svc = new DirectCollabAgentReplyDelegateService(
      makeConfig(),
      collabLlmBridge as any,
      { assembleForDirected: jest.fn(async () => ({ messages: [], auxiliarySystemText: '' })) } as any,
      { resolveLayerSetting: jest.fn(async () => ({ modelName: 'gpt-4o-mini' })) } as any,
      agentDirectSkillTools as any,
      { run: jest.fn() } as any,
      stubHrStaffing,
      stubTokenStream,
      {
        send: jest.fn((pattern: string) => {
          if (pattern === 'agents.findOne') {
            return of({ id: 'a-target', name: 'Bot', role: 'director', llmModel: 'glm-4.5' });
          }
          return of({});
        }),
      } as any,
    );

    const out = await svc.executeDirect(baseParams({ roomType: 'department' }));
    expect(out?.text).toContain('第一段');
    expect(out?.text).toContain('第二段');
    expect(out?.continuationRounds).toBe(1);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('department room uses director agent llmModel, not CEO replay layer', async () => {
    const invoke = jest.fn().mockResolvedValue({ content: '部门回复。' });
    const bind = jest.fn().mockReturnValue({ invoke });
    const collabLlmBridge = { createChatModel: jest.fn(async () => ({ bind })) };
    const resolveLayerSetting = jest.fn(async () => ({ modelName: 'ceo-replay-should-not-use' }));
    const agentDirectSkillTools = {
      build: jest.fn(async () => ({
        tools: [],
        allowedToolNames: new Set(),
        capabilitySkillIds: [],
        skillCatalog: [],
        boundMcpToolNames: [],
        skillCount: 0,
        usesToolCatalog: false,
        progressiveDisclosure: true,
      })),
    };

    const svc = makeSvc({
      config: makeConfig({ isDirectAgentSkillsEnabled: () => false }),
      collabLlmBridge,
      layerResolver: { resolveLayerSetting },
      skillTools: agentDirectSkillTools,
      skillLoop: { run: jest.fn() } as any,
      apiRpc: {
        send: jest.fn((pattern: string) => {
          if (pattern === 'agents.findOne') {
            return of({ id: 'dir-1', name: '产品主管', role: 'director', llmModel: 'glm-4.5' });
          }
          return of({});
        }),
      } as any,
    });

    const out = await svc.executeDirect(baseParams({ roomType: 'department' }));
    expect(out?.text).toBe('部门回复。');
    expect(resolveLayerSetting).not.toHaveBeenCalled();
    expect(collabLlmBridge.createChatModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelNameOverride: 'glm-4.5',
        fallbackModelName: 'glm-4.5',
        ceoContext: 'orchestration',
      }),
    );
  });
});
