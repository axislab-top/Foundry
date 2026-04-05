import { ROUTES, findRoute } from './routes.config.js';

describe('routes.config companies', () => {
  it('should contain companies rpc route entries', () => {
    const companiesRoutes = ROUTES.filter((r) => r.path.startsWith('/v1/companies'));
    const patterns = companiesRoutes.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'companies.findAll',
        'companies.findOne',
        'companies.create',
        'companies.quickCreate',
        'companies.createDraft',
        'companies.completeWizard',
        'companies.update',
        'companies.changeStatus',
      ]),
    );
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
    expect(findRoute('/v1/companies', 'POST')?.route.rpcPattern).toBe('companies.create');
    expect(findRoute('/v1/companies/quick-create', 'POST')?.route.rpcPattern).toBe('companies.quickCreate');
    expect(findRoute('/v1/companies/draft', 'POST')?.route.rpcPattern).toBe('companies.createDraft');
    expect(findRoute('/v1/companies/11111111-1111-4111-8111-111111111111/complete', 'POST')?.route.rpcPattern).toBe(
      'companies.completeWizard',
    );
  });
});
