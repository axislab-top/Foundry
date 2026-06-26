import { L1FeatureFlagService } from './l1-feature-flag.service.js';

describe('L1FeatureFlagService', () => {
  function makeService() {
    const send = jest.fn();
    const apiRpc = { send } as any;
    const config = {
      getWorkerActorUserId: jest.fn(() => 'worker-user'),
      getCollaborationMentionRpcTimeoutMs: jest.fn(() => 1000),
      isWorkerL1RefactorEnabled: jest.fn(() => false),
      getL1PromptVersion: jest.fn(() => 'v2.1-exact'),
      isL1PredictiveMoeEnabled: jest.fn(() => false),
      isL1PreContextEnabled: jest.fn(() => false),
      isL1TemporalPrewarmEnabled: jest.fn(() => false),
      isCollabIntent20261ForceEnabled: jest.fn(() => true),
      getPhase1RolloutPercent: jest.fn(() => 0),
      getPhase1RolloutWhitelistCompanyIds: jest.fn(() => []),
      getPhase2RolloutPercent: jest.fn(() => 0),
      getPhase2RolloutWhitelistCompanyIds: jest.fn(() => []),
      isMultiAgentGraphV2Enabled: jest.fn(() => false),
      isDirectorAutonomousEnabled: jest.fn(() => false),
      isEmployeeAutonomousEnabled: jest.fn(() => false),
      isAutonomousEventBusV2Enabled: jest.fn(() => false),
      isCrossDepartmentCoordinationEnabled: jest.fn(() => false),
      isCostAwareRoutingEnabled: jest.fn(() => false),
      getCostAwareRolloutPercent: jest.fn(() => 0),
      getCostAwareRolloutWhitelistCompanyIds: jest.fn(() => []),
      isCeoEarlyExitEnabled: jest.fn(() => true),
      isCeoReplayCollaborationEnabled: jest.fn(() => true),
    } as any;
    const tenantContext = {
      runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<unknown>) => fn()),
    } as any;
    const ceoLayerResolver = {
      getCompanyConfigSnapshot: jest.fn().mockResolvedValue(null),
    } as any;
    const svc = new L1FeatureFlagService(config, tenantContext, ceoLayerResolver, apiRpc);
    return { svc, send, config, tenantContext, ceoLayerResolver };
  }

  it('uses isolated per-company cache keys', async () => {
    const { svc } = makeService();
    (svc as any).fetchCompanyPrefs = jest
      .fn()
      .mockResolvedValueOnce({ L1_PROMPT_VERSION: 'v2.1-creative', WORKER_L1_REFACTOR_ENABLED: true })
      .mockResolvedValueOnce({ L1_PROMPT_VERSION: 'v2.1-exact', WORKER_L1_REFACTOR_ENABLED: false });
    (svc as any).fetchCeoLayerConfig = jest.fn().mockResolvedValue(null);

    const a = await svc.getPromptVersion('company-a');
    const b = await svc.getPromptVersion('company-b');

    expect(a).toBe('v2.1-creative');
    expect(b).toBe('v2.1-exact');
    expect((svc as any).cache.has('company:company-a:l1:feature_flags')).toBe(true);
    expect((svc as any).cache.has('company:company-b:l1:feature_flags')).toBe(true);
  });

  it('wraps reads in runWithCompanyId for each company', async () => {
    const { svc, tenantContext } = makeService();
    (svc as any).fetchCompanyPrefs = jest.fn().mockResolvedValue(null);
    (svc as any).fetchCeoLayerConfig = jest.fn().mockResolvedValue(null);

    await svc.isRefactorEnabled('c1');
    await svc.isRefactorEnabled('c2');

    expect(tenantContext.runWithCompanyId).toHaveBeenNthCalledWith(1, 'c1', expect.any(Function));
    expect(tenantContext.runWithCompanyId).toHaveBeenNthCalledWith(2, 'c2', expect.any(Function));
  });
});
