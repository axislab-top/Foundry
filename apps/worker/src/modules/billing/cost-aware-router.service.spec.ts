import { of } from 'rxjs';
import { CostAwareRouterService } from './cost-aware-router.service.js';

describe('CostAwareRouterService', () => {
  it('returns baseline when global gate is off', async () => {
    const config = {
      isCostAwareRoutingEnabled: () => false,
      getApiRpcTimeoutMs: () => 5000,
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
    } as any;
    const svc = new CostAwareRouterService(config, undefined);
    const p = await svc.decideTaskPriority({
      companyId: '00000000-0000-4000-8000-000000000001',
      effective: true,
      agentLevel: 2,
      baselinePriority: 'high',
    });
    expect(p).toBe('high');
  });

  it('downgrades non-CEO when utilization is above threshold', async () => {
    const send = jest.fn((pattern: string) => {
      if (pattern === 'billing.budgets.list') {
        return of([
          {
            scope: 'company',
            totalAmount: '100',
            usedAmount: '90',
          },
        ]);
      }
      return of(null);
    });
    const config = {
      isCostAwareRoutingEnabled: () => true,
      getCostAwareBudgetThreshold: () => 0.5,
      getApiRpcTimeoutMs: () => 5000,
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
    } as any;
    const svc = new CostAwareRouterService(config, { send } as any);
    const p = await svc.decideTaskPriority({
      companyId: '00000000-0000-4000-8000-000000000002',
      effective: true,
      agentLevel: 3,
      baselinePriority: 'normal',
    });
    expect(p).toBe('low');
  });
});
