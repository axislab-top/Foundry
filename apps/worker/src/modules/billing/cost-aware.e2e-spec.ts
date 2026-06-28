import { of } from 'rxjs';
import { CostAwareRouterService } from './cost-aware-router.service.js';

/**
 * W14：轻量 e2e 风格用例（同进程 Jest；验证 RPC + 决策链不断路）。
 */
describe('Cost-aware routing (e2e-style)', () => {
  it('CEO tier stays at least normal under extreme utilization', async () => {
    const send = jest.fn(() =>
      of([
        {
          scope: 'company',
          totalAmount: '50',
          usedAmount: '49',
        },
      ]),
    );
    const config = {
      isCostAwareRoutingEnabled: () => true,
      getCostAwareBudgetThreshold: () => 0.8,
      getApiRpcTimeoutMs: () => 5000,
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
    } as any;
    const svc = new CostAwareRouterService(config, { send } as any);
    const p = await svc.decideTaskPriority({
      companyId: '00000000-0000-4000-8000-000000000003',
      effective: true,
      agentLevel: 1,
      baselinePriority: 'high',
    });
    expect(['high', 'normal']).toContain(p);
  });
});
