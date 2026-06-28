import { ROUTES, findRoute } from './routes.config.js';

describe('routes.config companies', () => {
  it('should contain companies rpc route entries', () => {
    const companiesRoutes = ROUTES.filter((r) => r.path.startsWith('/v1/companies'));
    const patterns = companiesRoutes.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'companies.findAll',
        'companies.creationQuota',
        'companies.findOne',
        'companies.create',
        'companies.quickCreate',
        'companies.createDraft',
        'companies.completeWizard',
        'companies.update',
        'companies.changeStatus',
        'companies.membership.findActive',
        'marketplace.skills.listAvailableVersions',
        'marketplace.skills.upgradeVersion',
        'marketplace.hireRequests.create',
        'marketplace.hireRequests.list',
        'marketplace.hireRequests.findOne',
        'marketplace.hireRequests.approve',
        'marketplace.hireRequests.reject',
        'billing.rechargeOrders.list',
        'billing.rechargeOrders.create',
        'billing.rechargeOrders.approve',
        'billing.rechargeOrders.reject',
      ]),
    );
  });

  it('should match marketplace-skills routes before generic companies.update', () => {
    const cid = '11111111-1111-4111-8111-111111111111';
    expect(findRoute(`/v1/companies/${cid}/marketplace-skills/available-versions`, 'GET')?.route.rpcPattern).toBe(
      'marketplace.skills.listAvailableVersions',
    );
    expect(findRoute(`/v1/companies/${cid}/marketplace-skills/upgrade-version`, 'POST')?.route.rpcPattern).toBe(
      'marketplace.skills.upgradeVersion',
    );
    const up = ROUTES.findIndex((r) => r.rpcPattern === 'companies.update' && r.path === '/v1/companies/:id');
    const list = ROUTES.findIndex((r) => r.rpcPattern === 'marketplace.skills.listAvailableVersions');
    expect(list).toBeGreaterThanOrEqual(0);
    expect(up).toBeGreaterThan(list);
  });

  it('should match marketplace hire-requests before generic companies.update', () => {
    const cid = '22222222-2222-4222-8222-222222222222';
    const hireId = '33333333-3333-4333-8333-333333333333';
    expect(findRoute(`/v1/companies/${cid}/marketplace/hire-requests`, 'POST')?.route.rpcPattern).toBe(
      'marketplace.hireRequests.create',
    );
    expect(findRoute(`/v1/companies/${cid}/marketplace/hire-requests`, 'GET')?.route.rpcPattern).toBe(
      'marketplace.hireRequests.list',
    );
    expect(findRoute(`/v1/companies/${cid}/marketplace/hire-requests/${hireId}`, 'GET')?.route.rpcPattern).toBe(
      'marketplace.hireRequests.findOne',
    );
    expect(
      findRoute(`/v1/companies/${cid}/marketplace/hire-requests/${hireId}/approve`, 'POST')?.route.rpcPattern,
    ).toBe('marketplace.hireRequests.approve');
    expect(
      findRoute(`/v1/companies/${cid}/marketplace/hire-requests/${hireId}/reject`, 'POST')?.route.rpcPattern,
    ).toBe('marketplace.hireRequests.reject');
    const patchIdx = ROUTES.findIndex((r) => r.rpcPattern === 'companies.update' && r.path === '/v1/companies/:id');
    const hireIdx = ROUTES.findIndex((r) => r.rpcPattern === 'marketplace.hireRequests.create');
    expect(hireIdx).toBeGreaterThanOrEqual(0);
    expect(patchIdx).toBeGreaterThan(hireIdx);
  });

  it('should match billing recharge-orders routes', () => {
    const cid = '44444444-4444-4444-8444-444444444444';
    const orderId = '55555555-5555-4555-8555-555555555555';
    expect(findRoute(`/v1/companies/${cid}/billing/recharge-orders`, 'GET')?.route.rpcPattern).toBe(
      'billing.rechargeOrders.list',
    );
    expect(findRoute(`/v1/companies/${cid}/billing/recharge-orders`, 'POST')?.route.rpcPattern).toBe(
      'billing.rechargeOrders.create',
    );
    expect(
      findRoute(`/v1/companies/${cid}/billing/recharge-orders/${orderId}/approve`, 'POST')?.route.rpcPattern,
    ).toBe('billing.rechargeOrders.approve');
    expect(
      findRoute(`/v1/companies/${cid}/billing/recharge-orders/${orderId}/reject`, 'POST')?.route.rpcPattern,
    ).toBe('billing.rechargeOrders.reject');
  });

  it('should preserve status route ahead of generic /v1/* fallback', () => {
    const statusIndex = ROUTES.findIndex(
      (r) =>
        r.path === '/v1/companies/:id/status' &&
        r.rpcPattern === 'companies.changeStatus',
    );
    const fallbackIndex = ROUTES.findIndex((r) => r.path === '/v1/*');
    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(fallbackIndex).toBeGreaterThan(statusIndex);

    const matched = findRoute('/v1/companies');
    expect(matched?.route.path).toBe('/v1/companies');

    expect(findRoute('/v1/companies', 'GET')?.route.rpcPattern).toBe('companies.findAll');
    expect(findRoute('/v1/companies/creation-quota', 'GET')?.route.rpcPattern).toBe(
      'companies.creationQuota',
    );
    expect(findRoute('/v1/companies', 'POST')?.route.rpcPattern).toBe('companies.create');
    expect(findRoute('/v1/companies/quick-create', 'POST')?.route.rpcPattern).toBe('companies.quickCreate');
    expect(findRoute('/v1/companies/draft', 'POST')?.route.rpcPattern).toBe('companies.createDraft');
    expect(findRoute('/v1/companies/11111111-1111-4111-8111-111111111111/complete', 'POST')?.route.rpcPattern).toBe(
      'companies.completeWizard',
    );
  });

  it('should match active membership me route', () => {
    const cid = '66666666-6666-4666-8666-666666666666';
    expect(findRoute(`/v1/companies/${cid}/memberships/me`, 'GET')?.route.rpcPattern).toBe(
      'companies.membership.findActive',
    );
  });
});
