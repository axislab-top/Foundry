import { ROUTES } from './routes.config.js';

describe('routes.config billing', () => {
  it('should expose billing & dashboard billing RPC routes', () => {
    const patterns = ROUTES.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'dashboard.billingSummary',
        'billing.records.list',
        'billing.record.append',
        'billing.budgets.list',
        'billing.budget.upsert',
        'billing.settings.get',
        'billing.settings.update',
        'billing.modelRouter.resolve',
        'billing.checkAllowance',
      ]),
    );
  });
});
