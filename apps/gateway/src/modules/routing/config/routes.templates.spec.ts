import { ROUTES, findRoute } from './routes.config.js';
import { ALLOWED_RPC_PATTERNS } from './rpc-patterns.config.js';

describe('routes.config templates & marketplace', () => {
  it('exposes templates and marketplace RPC routes', () => {
    const patterns = ROUTES.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'templates.findAll',
        'templates.findOne',
        'templates.preview',
        'templates.import',
        'marketplace.agents.findAll',
        'marketplace.agents.findOne',
        'marketplace.agents.purchase',
      ]),
    );
  });

  it('whitelists marketplace hire request RPC patterns', () => {
    expect(ALLOWED_RPC_PATTERNS).toEqual(
      expect.arrayContaining([
        'marketplace.hireRequests.create',
        'marketplace.hireRequests.list',
        'marketplace.hireRequests.findOne',
        'marketplace.hireRequests.approve',
        'marketplace.hireRequests.reject',
      ]),
    );
  });

  it('matches /v1/templates/:id/preview before /v1/templates/:id', () => {
    const previewIndex = ROUTES.findIndex(
      (r) => r.path === '/v1/templates/:id/preview' && r.rpcPattern === 'templates.preview',
    );
    const idIndex = ROUTES.findIndex(
      (r) => r.path === '/v1/templates/:id' && r.rpcPattern === 'templates.findOne',
    );
    expect(previewIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThanOrEqual(0);
    expect(previewIndex).toBeLessThan(idIndex);

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const matched = findRoute(`/v1/templates/${uuid}/preview`);
    expect(matched?.route.rpcPattern).toBe('templates.preview');
    expect(matched?.params.id).toBe(uuid);
  });

  it('matches /v1/collaboration/rooms/department-by-slug before /v1/collaboration/rooms/:roomId', () => {
    const slugIndex = ROUTES.findIndex(
      (r) =>
        r.path === '/v1/collaboration/rooms/department-by-slug' &&
        r.rpcPattern === 'collaboration.rooms.findDepartmentBySlug',
    );
    const roomIdIndex = ROUTES.findIndex(
      (r) =>
        r.path === '/v1/collaboration/rooms/:roomId' &&
        r.rpcPattern === 'collaboration.rooms.findOne',
    );
    expect(slugIndex).toBeGreaterThanOrEqual(0);
    expect(roomIdIndex).toBeGreaterThanOrEqual(0);
    expect(slugIndex).toBeLessThan(roomIdIndex);

    const matched = findRoute('/v1/collaboration/rooms/department-by-slug');
    expect(matched?.route.rpcPattern).toBe('collaboration.rooms.findDepartmentBySlug');
  });

  it('matches marketplace purchase before generic agent id', () => {
    const purchaseIndex = ROUTES.findIndex(
      (r) =>
        r.path === '/v1/marketplace/agents/:id/purchase' &&
        r.rpcPattern === 'marketplace.agents.purchase',
    );
    const oneIndex = ROUTES.findIndex(
      (r) =>
        r.path === '/v1/marketplace/agents/:id' && r.rpcPattern === 'marketplace.agents.findOne',
    );
    expect(purchaseIndex).toBeGreaterThanOrEqual(0);
    expect(oneIndex).toBeGreaterThanOrEqual(0);
    expect(purchaseIndex).toBeLessThan(oneIndex);

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const purchase = findRoute(`/v1/marketplace/agents/${uuid}/purchase`);
    expect(purchase?.route.rpcPattern).toBe('marketplace.agents.purchase');
  });

  it('matches collaboration orchestration-runs subpath', () => {
    const roomId = '550e8400-e29b-41d4-a716-446655440099';
    const matched = findRoute(`/v1/collaboration/rooms/${roomId}/orchestration-runs`, 'GET');
    expect(matched?.route.rpcPattern).toBe('collaboration.orchestrationRuns.listByRoom');
    expect(matched?.params.roomId).toBe(roomId);
  });
});
