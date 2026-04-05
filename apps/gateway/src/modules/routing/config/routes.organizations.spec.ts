import { ROUTES, findRoute } from './routes.config.js';

describe('routes.config organizations', () => {
  it('should contain organization rpc route entries', () => {
    const routes = ROUTES.filter((r) => r.path.startsWith('/v1/organizations'));
    const patterns = routes.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'organization.tree',
        'organization.node.create',
        'organization.node.update',
        'organization.node.move',
        'organization.node.remove',
        'organization.node.agents',
        'organization.node.reportingChain',
        'organization.audit.logs',
      ]),
    );
  });

  it('should match organization tree route before generic fallback', () => {
    const routeIndex = ROUTES.findIndex(
      (r) => r.path === '/v1/organizations/tree' && r.rpcPattern === 'organization.tree',
    );
    const fallbackIndex = ROUTES.findIndex((r) => r.path === '/v1/*');

    expect(routeIndex).toBeGreaterThanOrEqual(0);
    expect(fallbackIndex).toBeGreaterThan(routeIndex);

    const matched = findRoute('/v1/organizations/tree');
    expect(matched?.route.path).toBe('/v1/organizations/tree');
  });
});
