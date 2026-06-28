/**
 * W13「端到端」命名：验证 Memory Graph 门控与因果查询在模块边界的组合行为（纯 DI mock，无需 Postgres）。
 */
import { MemoryGraphRolloutService } from './services/memory-graph-rollout.service.js';
import { MemoryGraphService } from './services/memory-graph.service.js';

describe('memory-graph.e2e-spec (W13 mocked boundary)', () => {
  it('rollout + causal inbound query compose without throwing', async () => {
    const config = {
      isMemoryGraphV2Enabled: () => true,
      getMemoryGraphV2RolloutPercent: () => 100,
      getMemoryGraphV2RolloutWhitelistCompanyIds: () => [],
      get: jest.fn(),
    } as any;
    const rollout = new MemoryGraphRolloutService(config);

    const companyId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await expect(rollout.isMemoryGraphV2Effective(companyId)).resolves.toBe(true);

    const dataSource = {
      query: jest.fn().mockResolvedValue([{ entryId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', c: 3 }]),
    } as any;
    const graph = new MemoryGraphService(dataSource, {} as any, config, rollout);
    const counts = await graph.getCausalInboundCounts(companyId, ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee']);
    expect(counts.get('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')).toBe(3);
  });
});
