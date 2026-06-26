import { CeoLayerConfigResolverService } from './ceo-layer-config-resolver.service.js';

describe('CeoLayerConfigResolverService', () => {
  function makeService(
    response: { templateConfig?: Record<string, unknown>; companyConfig?: Record<string, unknown> },
    opts?: {
      findOneRow?: Record<string, unknown> | null;
    },
  ) {
    const config = {
      getWorkerActorUserId: jest.fn(() => 'worker-user'),
      getWorkerDirectAgentDefaultInjectCompanyProfile: jest.fn(() => true),
      getWorkerDirectAgentDefaultInjectRecentTranscript: jest.fn(() => true),
      getWorkerDirectAgentTranscriptMessageCount: jest.fn(() => 10),
    } as any;
    const globalLayerConfig = {
      getStrategyModel: jest.fn(() => 'gpt-4o'),
      getOrchestrationModel: jest.fn(() => 'gpt-4o-mini'),
      getSupervisionModel: jest.fn(() => 'gpt-4o-mini'),
      getIntentLayerModel: jest.fn(() => 'gpt-4o-mini'),
      getReplayModel: jest.fn(() => ''),
    } as any;
    const ceoQueue = {
      send: jest.fn(async (pattern: string) => {
        if (pattern === 'companies.findOne') {
          return opts?.findOneRow ?? null;
        }
        return response;
      }),
    } as any;
    const modelRuleEnforcer = {
      enforceChatRequired: jest.fn(),
    } as any;
    const svc = new CeoLayerConfigResolverService(config, globalLayerConfig, ceoQueue, modelRuleEnforcer);
    return { svc, ceoQueue, modelRuleEnforcer, globalLayerConfig };
  }

  it('resolves strategy config from company ceoLayerConfig.strategy', async () => {
    const { svc } = makeService({
      companyConfig: {
        strategy: {
          modelName: 'claude-3-5-sonnet',
          systemPrompt: 'You are strategy planner.',
        },
      },
    });

    const setting = await svc.resolveLayerSetting('company-a', 'strategy');
    expect(setting.modelName).toBe('claude-3-5-sonnet');
    expect(setting.systemPrompt).toBe('You are strategy planner.');
  });

  it('uses template strategy modelName when company omits model (no Worker env fallback)', async () => {
    const { svc } = makeService({
      templateConfig: { strategy: { modelName: 'from-marketplace-template' } },
      companyConfig: { strategy: { systemPrompt: 'x' } },
    });
    const setting = await svc.resolveLayerSetting('company-tpl', 'strategy');
    expect(setting.modelName).toBe('from-marketplace-template');
  });

  it('returns empty strategy modelName when company and template omit it (no env fallback)', async () => {
    const { svc } = makeService({
      companyConfig: { strategy: { systemPrompt: 'only-prompt' } },
    });
    const setting = await svc.resolveLayerSetting('company-empty-model', 'strategy');
    expect(setting.modelName).toBe('');
  });

  it('falls back replay modelName to Worker env when contextPolicy.replay omits model', async () => {
    const { svc, globalLayerConfig } = makeService({ companyConfig: {} });
    (globalLayerConfig.getReplayModel as jest.Mock).mockReturnValue('glm-4-flash');
    const setting = await svc.resolveLayerSetting('company-replay-env', 'replay');
    expect(setting.modelName).toBe('glm-4-flash');
  });

  it('inherits replay modelName and keyIds from company orchestration when replay is unset', async () => {
    const { svc, globalLayerConfig } = makeService({
      companyConfig: {
        orchestration: {
          modelName: 'deepseek-v4-flash',
          keyIds: ['fe7982d0-9519-43e3-b2f1-8633aed161d5'],
        },
      },
    });
    (globalLayerConfig.getReplayModel as jest.Mock).mockReturnValue('glm-4-flash');
    const setting = await svc.resolveLayerSetting('company-replay-orchestration', 'replay');
    expect(setting.modelName).toBe('deepseek-v4-flash');
    expect(setting.keyIds).toEqual(['fe7982d0-9519-43e3-b2f1-8633aed161d5']);
  });

  it('does not inherit replay from strategy when orchestration is unset', async () => {
    const { svc, globalLayerConfig } = makeService({
      companyConfig: {
        strategy: {
          modelName: 'deepseek-v4-flash',
          keyIds: ['cd598f68-b9d1-4c5f-b373-8421bd891582'],
        },
      },
    });
    (globalLayerConfig.getReplayModel as jest.Mock).mockReturnValue('glm-4-flash');
    const setting = await svc.resolveLayerSetting('company-replay-no-orch', 'replay');
    expect(setting.modelName).toBe('glm-4-flash');
    expect(setting.keyIds).toEqual([]);
  });

  it('prefers company contextPolicy.replay modelName over Worker env', async () => {
    const { svc, globalLayerConfig } = makeService({
      companyConfig: {
        strategy: {
          contextPolicy: {
            replay: { modelName: 'deepseek-chat' },
          },
        },
      },
    });
    (globalLayerConfig.getReplayModel as jest.Mock).mockReturnValue('glm-4-flash');
    const setting = await svc.resolveLayerSetting('company-replay-override', 'replay');
    expect(setting.modelName).toBe('deepseek-chat');
  });

  it('returns normalized snapshot aliases for feature-flag reader', async () => {
    const { svc } = makeService({
      companyConfig: {
        orchestration: {
          l1_prompt_version: 'v2.1-creative',
        },
      },
    });

    const snapshot = await svc.getCompanyConfigSnapshot('company-b');
    expect(snapshot.orchestration).toBeDefined();
    expect(snapshot.orchestration).toMatchObject({ l1_prompt_version: 'v2.1-creative' });
  });

  it('getDirectAgentMemoryInjectConfig merges runtime_preferences.collaboration overrides', async () => {
    const { svc } = makeService(
      { companyConfig: {} },
      {
        findOneRow: {
          runtime_preferences: {
            collaboration: {
              directAgentDefaultInjectCompanyProfile: false,
              directAgentTranscriptMessageCount: 6,
            },
          },
        },
      },
    );

    const cfg = await svc.getDirectAgentMemoryInjectConfig('company-c');
    expect(cfg.injectCompanyProfile).toBe(false);
    expect(cfg.injectRecentTranscript).toBe(true);
    expect(cfg.transcriptMessageCount).toBe(6);
  });
});

