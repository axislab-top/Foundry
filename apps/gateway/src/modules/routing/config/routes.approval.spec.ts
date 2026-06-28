import { ROUTES, findRoute } from './routes.config.js';

describe('routes.config M4 approval', () => {
  it('should expose approval RPC routes', () => {
    const patterns = ROUTES.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'approval.create',
        'approval.list',
        'approval.listPending',
        'approval.findOne',
        'approval.stats',
        'approval.approve',
        'approval.reject',
        'approval.consumeExecutionToken',
        'approval.applyGatedConfig',
      ]),
    );
  });

  it('should match GET /v1/approvals to approval.list', () => {
    const r = findRoute('/v1/approvals', 'GET');
    expect(r?.route.rpcPattern).toBe('approval.list');
  });

  it('should match GET /v1/approvals/stats to approval.stats', () => {
    const r = findRoute('/v1/approvals/stats', 'GET');
    expect(r?.route.rpcPattern).toBe('approval.stats');
  });

  it('should match approvals approve path with approvalId param', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const r = findRoute(`/v1/approvals/${id}/approve`, 'POST');
    expect(r?.route.rpcPattern).toBe('approval.approve');
    expect(r?.params.approvalId).toBe(id);
  });

  it('should match approvals findOne path with approvalId param', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const r = findRoute(`/v1/approvals/${id}`, 'GET');
    expect(r?.route.rpcPattern).toBe('approval.findOne');
    expect(r?.params.approvalId).toBe(id);
  });
});
