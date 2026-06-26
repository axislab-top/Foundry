import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';
import { StructuredLLMRoutingException } from '../../common/exceptions/structured-config-query.exception.js';
import { RateLimitExceededException } from './rate-limit/rate-limit-guard.service.js';

describe('CollaborationLlmBridgeService (temperature)', () => {
  const tenantContext = {
    runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<unknown>) => fn()),
    getCompanyId: jest.fn(() => 'c1'),
  } as any;
  const l1FeatureFlags = { isCostAwareRoutingEffective: jest.fn(async () => false) } as any;
  const costAwareRouter = {
    decideTaskPriority: jest.fn(async (input: { baselinePriority?: string }) => (input.baselinePriority ?? 'high') as any),
  } as any;
  const llmKeyPoolCache = { get: jest.fn(() => null), set: jest.fn() } as any;

  it('passes per-layer temperature into chatFactory.create', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCeoLlmEstimatedCost: () => 0.001,
      getCollaborationLlmTimeoutMs: () => 5000,
      isCollabLlmMeteringEnabled: () => false,
      isCostAwareRoutingEnabled: () => false,
      isCollabCeoRespectsAgentFixedLlmKey: () => true,
    } as any;
    const monitoring = { observeCeoPipelineLayerSeconds: jest.fn(), recordLlmKeyResolutionPolicy: jest.fn() } as any;
    const prepCache = {
      get: jest.fn(async () => ({
        modelName: 'gpt-4o-mini',
        apiKey: 'k',
        providerKind: 'openai',
        requestUrl: 'http://x',
        llmKeyId: 'kid',
      })),
    } as any;
    const ceoQueue = { send: jest.fn() } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ temperature: 0.77 })),
    } as any;
    const chatFactory = { create: jest.fn(() => ({ invoke: jest.fn() })) } as any;
    const llmKeyResolver = { acquireWithFallback: jest.fn() } as any;
    const modelRuleEnforcer = { enforceChatRequired: jest.fn() } as any;
    const billingTokenMiddleware = { wrapChatModel: jest.fn((m: unknown) => m) } as any;
    const rateLimitGuard = { assertWithinLimit: jest.fn(async () => undefined), registerProvider429: jest.fn() } as any;

    const svc = new CollaborationLlmBridgeService(
      config,
      monitoring,
      prepCache,
      ceoQueue,
      ceoLayerConfigResolver,
      chatFactory,
      llmKeyResolver,
      modelRuleEnforcer,
      billingTokenMiddleware,
      rateLimitGuard,
      tenantContext,
      l1FeatureFlags,
      costAwareRouter,
      llmKeyPoolCache,
    );
    (svc as any).sleep = jest.fn(async () => undefined);

    await svc.createChatModel({
      companyId: 'c1',
      fallbackModelName: 'gpt-4o-mini',
      ceoContext: 'orchestration',
    });

    expect(ceoLayerConfigResolver.resolveLayerSetting).toHaveBeenCalledWith('c1', 'orchestration');
    expect(chatFactory.create).toHaveBeenCalledWith(
      'gpt-4o-mini',
      'k',
      'openai',
      'http://x',
      5000,
      2048,
      0.77,
      undefined,
    );
  });

  it('prefers agent llmModel over billing.modelRouter for non-ceo roles', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCeoLlmEstimatedCost: () => 0.001,
      getCollaborationLlmTimeoutMs: () => 5000,
      isCollabLlmMeteringEnabled: () => false,
      isCostAwareRoutingEnabled: () => false,
      isCollabCeoRespectsAgentFixedLlmKey: () => true,
    } as any;
    const monitoring = { observeCeoPipelineLayerSeconds: jest.fn(), recordLlmKeyResolutionPolicy: jest.fn() } as any;
    const prepCache = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) } as any;
    const ceoQueue = {
      send: jest.fn(async (pattern: string) => {
        if (pattern === 'billing.checkAllowance') return { allowed: true };
        if (pattern === 'agents.llmKeyPoolCandidates') return { llmKeyIds: [], source: 'test' };
        if (pattern === 'billing.modelRouter.resolve') return { modelName: 'from-router' };
        return {};
      }),
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ temperature: 0.2 })),
    } as any;
    const chatFactory = { create: jest.fn(() => ({ invoke: jest.fn() })) } as any;
    const acquireWithFallback = jest.fn(async () => ({
      llmKeyId: 'k1',
      apiKey: 'sk',
      providerKind: 'openai',
      requestUrl: 'https://example/v1',
      modelName: 'from-key-row',
    }));
    const llmKeyResolver = { acquireWithFallback } as any;
    const modelRuleEnforcer = { enforceChatRequired: jest.fn() } as any;
    const billingTokenMiddleware = { wrapChatModel: jest.fn((m: unknown) => m) } as any;
    const rateLimitGuard = { assertWithinLimit: jest.fn(async () => undefined), registerProvider429: jest.fn() } as any;

    const svc = new CollaborationLlmBridgeService(
      config,
      monitoring,
      prepCache,
      ceoQueue,
      ceoLayerConfigResolver,
      chatFactory,
      llmKeyResolver,
      modelRuleEnforcer,
      billingTokenMiddleware,
      rateLimitGuard,
      tenantContext,
      l1FeatureFlags,
      costAwareRouter,
      llmKeyPoolCache,
    );
    (svc as any).sleep = jest.fn(async () => undefined);

    await svc.createChatModel({
      companyId: 'c1',
      agentId: 'member-1',
      agent: { role: 'member', llmModel: 'admin-bound-chat-model' },
      fallbackModelName: 'fb',
      ceoContext: 'orchestration',
    });

    expect(acquireWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ requestedModelName: 'admin-bound-chat-model' }),
    );
  });

  it('throws when no model name can be resolved (no env fallback)', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCeoLlmEstimatedCost: () => 0.001,
      getCollaborationLlmTimeoutMs: () => 5000,
      isCollabLlmMeteringEnabled: () => false,
      isCostAwareRoutingEnabled: () => false,
      isCollabCeoRespectsAgentFixedLlmKey: () => true,
    } as any;
    const monitoring = { observeCeoPipelineLayerSeconds: jest.fn(), recordLlmKeyResolutionPolicy: jest.fn() } as any;
    const prepCache = { get: jest.fn(async () => null), set: jest.fn() } as any;
    const ceoQueue = {
      send: jest.fn(async (pattern: string) => {
        if (pattern === 'billing.checkAllowance') return { allowed: true };
        if (pattern === 'agents.llmKeyPoolCandidates') return { llmKeyIds: [], source: 'test' };
        if (pattern === 'billing.modelRouter.resolve') return {};
        return {};
      }),
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ modelName: '', temperature: 0.2 })),
    } as any;
    const chatFactory = { create: jest.fn() } as any;
    const llmKeyResolver = { acquireWithFallback: jest.fn() } as any;
    const modelRuleEnforcer = { enforceChatRequired: jest.fn() } as any;
    const billingTokenMiddleware = { wrapChatModel: jest.fn((m: unknown) => m) } as any;
    const rateLimitGuard = { assertWithinLimit: jest.fn(async () => undefined), registerProvider429: jest.fn() } as any;

    const svc = new CollaborationLlmBridgeService(
      config,
      monitoring,
      prepCache,
      ceoQueue,
      ceoLayerConfigResolver,
      chatFactory,
      llmKeyResolver,
      modelRuleEnforcer,
      billingTokenMiddleware,
      rateLimitGuard,
      tenantContext,
      l1FeatureFlags,
      costAwareRouter,
      llmKeyPoolCache,
    );
    (svc as any).sleep = jest.fn(async () => undefined);

    await expect(
      svc.createChatModel({
        companyId: 'c1',
        agentId: 'member-1',
        agent: { role: 'member' },
        fallbackModelName: '   ',
        ceoContext: 'orchestration',
      }),
    ).rejects.toBeInstanceOf(StructuredLLMRoutingException);
  });

  it('skips billing modelRouter for ceo role', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCeoLlmEstimatedCost: () => 0.001,
      getCollaborationLlmTimeoutMs: () => 5000,
      isCollabLlmMeteringEnabled: () => false,
      isCostAwareRoutingEnabled: () => false,
      isCollabCeoRespectsAgentFixedLlmKey: () => true,
    } as any;
    const monitoring = { observeCeoPipelineLayerSeconds: jest.fn(), recordLlmKeyResolutionPolicy: jest.fn() } as any;
    const prepCache = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) } as any;
    const ceoQueue = {
      send: jest.fn(async (pattern: string) => {
        if (pattern === 'billing.checkAllowance') return { allowed: true };
        if (pattern === 'agents.llmKeyPoolCandidates') return { llmKeyIds: [], source: 'test' };
        if (pattern === 'billing.modelRouter.resolve') return { modelName: 'Qwen3-Embedding-8B' };
        return {};
      }),
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ temperature: 0.2 })),
    } as any;
    const chatFactory = { create: jest.fn(() => ({ invoke: jest.fn() })) } as any;
    const llmKeyResolver = {
      acquireWithFallback: jest.fn(async () => ({
        llmKeyId: 'k1',
        apiKey: 'sk',
        providerKind: 'openai',
        requestUrl: 'https://api.scnet.cn/api/llm/v1',
        modelName: 'Qwen3-235B-A22B',
      })),
    } as any;
    const modelRuleEnforcer = { enforceChatRequired: jest.fn() } as any;
    const billingTokenMiddleware = { wrapChatModel: jest.fn((m: unknown) => m) } as any;
    const rateLimitGuard = { assertWithinLimit: jest.fn(async () => undefined), registerProvider429: jest.fn() } as any;

    const svc = new CollaborationLlmBridgeService(
      config,
      monitoring,
      prepCache,
      ceoQueue,
      ceoLayerConfigResolver,
      chatFactory,
      llmKeyResolver,
      modelRuleEnforcer,
      billingTokenMiddleware,
      rateLimitGuard,
      tenantContext,
      l1FeatureFlags,
      costAwareRouter,
      llmKeyPoolCache,
    );
    (svc as any).sleep = jest.fn(async () => undefined);

    await svc.createChatModel({
      companyId: 'c1',
      agentId: 'a-ceo',
      agent: { role: 'ceo', llmKeyId: 'embed-key' },
      fallbackModelName: 'Qwen3-235B-A22B',
      ceoContext: 'strategy',
    });

    expect(billingTokenMiddleware.wrapChatModel).not.toHaveBeenCalled();

    expect(ceoQueue.send).not.toHaveBeenCalledWith(
      'billing.modelRouter.resolve',
      expect.anything(),
    );
    expect(llmKeyResolver.acquireWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedModelName: 'Qwen3-235B-A22B',
        fixedLlmKeyId: 'embed-key',
      }),
    );
  });

  it('wraps rate-limit after billing wrap', async () => {
    const baseModel = {
      invoke: jest.fn(async () => ({ content: 'ok' })),
    };
    const wrappedByBillingInvoke = jest.fn(async () => ({ content: 'ok-billed' }));
    const wrappedByBilling = {
      invoke: wrappedByBillingInvoke,
    };
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCeoLlmEstimatedCost: () => 0.001,
      getCollaborationLlmTimeoutMs: () => 5000,
      isCollabLlmMeteringEnabled: () => false,
      isCostAwareRoutingEnabled: () => false,
      isCollabCeoRespectsAgentFixedLlmKey: () => true,
    } as any;
    const monitoring = { observeCeoPipelineLayerSeconds: jest.fn(), recordLlmKeyResolutionPolicy: jest.fn() } as any;
    const prepCache = {
      get: jest.fn(async () => ({
        modelName: 'gpt-4o-mini',
        apiKey: 'k',
        providerKind: 'openai',
        requestUrl: 'http://x',
        llmKeyId: 'kid',
      })),
    } as any;
    const ceoQueue = { send: jest.fn() } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ temperature: 0.5 })),
    } as any;
    const chatFactory = { create: jest.fn(() => baseModel) } as any;
    const llmKeyResolver = { acquireWithFallback: jest.fn() } as any;
    const modelRuleEnforcer = { enforceChatRequired: jest.fn() } as any;
    const billingTokenMiddleware = {
      wrapChatModel: jest.fn(() => wrappedByBilling),
    } as any;
    const rateLimitGuard = { assertWithinLimit: jest.fn(async () => undefined), registerProvider429: jest.fn() } as any;
    const svc = new CollaborationLlmBridgeService(
      config,
      monitoring,
      prepCache,
      ceoQueue,
      ceoLayerConfigResolver,
      chatFactory,
      llmKeyResolver,
      modelRuleEnforcer,
      billingTokenMiddleware,
      rateLimitGuard,
      tenantContext,
      l1FeatureFlags,
      costAwareRouter,
      llmKeyPoolCache,
    );

    const model = await svc.createChatModel({
      companyId: 'c1',
      agentId: 'a-member',
      agent: { role: 'member', llmKeyId: 'kid' },
      fallbackModelName: 'gpt-4o-mini',
      ceoContext: 'orchestration',
      trace: { callsite: 'test-callsite', messageId: 'm1' },
    });
    await (model as any).invoke([{ role: 'user', content: 'hello' }]);

    expect(billingTokenMiddleware.wrapChatModel).toHaveBeenCalledWith(baseModel, {
      modelName: 'gpt-4o-mini',
      llmKeyId: 'kid',
      callsite: 'test-callsite',
    });
    expect(wrappedByBillingInvoke).toHaveBeenCalledTimes(1);
    expect(baseModel.invoke).not.toHaveBeenCalled();
    expect(rateLimitGuard.assertWithinLimit).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', phase: 'invoke' }),
    );
  });

  it('retries invoke on provider 429 then succeeds', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCeoLlmEstimatedCost: () => 0.001,
      getCollaborationLlmTimeoutMs: () => 5000,
      isCollabLlmMeteringEnabled: () => false,
      isCostAwareRoutingEnabled: () => false,
      isCollabCeoRespectsAgentFixedLlmKey: () => true,
    } as any;
    const monitoring = { observeCeoPipelineLayerSeconds: jest.fn(), recordLlmKeyResolutionPolicy: jest.fn() } as any;
    const prepCache = {
      get: jest.fn(async () => ({
        modelName: 'gpt-4o-mini',
        apiKey: 'k',
        providerKind: 'openai',
        requestUrl: 'http://x',
        llmKeyId: 'kid',
      })),
    } as any;
    const ceoQueue = { send: jest.fn() } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ temperature: 0.3 })),
    } as any;
    const invoke = jest
      .fn()
      .mockRejectedValueOnce(new Error('429 Too Many Requests'))
      .mockResolvedValueOnce({ content: 'ok-after-retry' });
    const chatFactory = { create: jest.fn(() => ({ invoke })) } as any;
    const llmKeyResolver = { acquireWithFallback: jest.fn() } as any;
    const modelRuleEnforcer = { enforceChatRequired: jest.fn() } as any;
    const billingTokenMiddleware = { wrapChatModel: jest.fn((m: unknown) => m) } as any;
    const rateLimitGuard = { assertWithinLimit: jest.fn(async () => undefined), registerProvider429: jest.fn(async () => undefined) } as any;
    const svc = new CollaborationLlmBridgeService(
      config,
      monitoring,
      prepCache,
      ceoQueue,
      ceoLayerConfigResolver,
      chatFactory,
      llmKeyResolver,
      modelRuleEnforcer,
      billingTokenMiddleware,
      rateLimitGuard,
      tenantContext,
      l1FeatureFlags,
      costAwareRouter,
      llmKeyPoolCache,
    );

    const model = await svc.createChatModel({
      companyId: 'c1',
      fallbackModelName: 'gpt-4o-mini',
      ceoContext: 'orchestration',
      trace: { messageId: 'm2', callsite: 'retry-test' },
    });

    const out = await (model as any).invoke('hello');
    expect(out).toEqual({ content: 'ok-after-retry' });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(rateLimitGuard.registerProvider429).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', cooldownMs: 1000 }),
    );
  });

  it('throws RateLimitExceededException after 3 provider 429 retries', async () => {
    const config = {
      getWorkerActorUserId: () => 'worker',
      getCeoLlmEstimatedCost: () => 0.001,
      getCollaborationLlmTimeoutMs: () => 5000,
      isCollabLlmMeteringEnabled: () => false,
      isCostAwareRoutingEnabled: () => false,
      isCollabCeoRespectsAgentFixedLlmKey: () => true,
    } as any;
    const monitoring = { observeCeoPipelineLayerSeconds: jest.fn(), recordLlmKeyResolutionPolicy: jest.fn() } as any;
    const prepCache = {
      get: jest.fn(async () => ({
        modelName: 'gpt-4o-mini',
        apiKey: 'k',
        providerKind: 'openai',
        requestUrl: 'http://x',
        llmKeyId: 'kid',
      })),
    } as any;
    const ceoQueue = { send: jest.fn() } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ temperature: 0.3 })),
    } as any;
    const invoke = jest.fn(async () => {
      throw new Error('429 Too Many Requests');
    });
    const chatFactory = { create: jest.fn(() => ({ invoke })) } as any;
    const llmKeyResolver = { acquireWithFallback: jest.fn() } as any;
    const modelRuleEnforcer = { enforceChatRequired: jest.fn() } as any;
    const billingTokenMiddleware = { wrapChatModel: jest.fn((m: unknown) => m) } as any;
    const rateLimitGuard = { assertWithinLimit: jest.fn(async () => undefined), registerProvider429: jest.fn(async () => undefined) } as any;
    const svc = new CollaborationLlmBridgeService(
      config,
      monitoring,
      prepCache,
      ceoQueue,
      ceoLayerConfigResolver,
      chatFactory,
      llmKeyResolver,
      modelRuleEnforcer,
      billingTokenMiddleware,
      rateLimitGuard,
      tenantContext,
      l1FeatureFlags,
      costAwareRouter,
      llmKeyPoolCache,
    );

    const model = await svc.createChatModel({
      companyId: 'c1',
      fallbackModelName: 'gpt-4o-mini',
      ceoContext: 'orchestration',
      trace: { messageId: 'm3', callsite: 'retry-exhausted-test' },
    });

    await expect((model as any).invoke('hello')).rejects.toBeInstanceOf(RateLimitExceededException);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(rateLimitGuard.registerProvider429).toHaveBeenCalledTimes(3);
  });
});

