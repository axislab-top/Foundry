import { ROUTES, findRoute } from './routes.config.js';

describe('routes.config management chain', () => {
  it('exposes management-related RPC routes', () => {
    const patterns = ROUTES.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'agents.management.subordinates',
        'agents.management.supervisorChain',
        'tasks.delegateByDirector',
        'tasks.delegation.candidates',
        'tasks.reviewByDirector',
        'collaboration.director.reportProgress',
      ]),
    );
  });

  it('matches new management routes with params', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(findRoute(`/v1/agents/${id}/subordinates`, 'GET')?.route.rpcPattern).toBe(
      'agents.management.subordinates',
    );
    expect(findRoute(`/v1/agents/${id}/supervisor-chain`, 'GET')?.route.rpcPattern).toBe(
      'agents.management.supervisorChain',
    );
    expect(findRoute(`/v1/tasks/${id}/delegate`, 'POST')?.route.rpcPattern).toBe(
      'tasks.delegateByDirector',
    );
    expect(findRoute(`/v1/tasks/${id}/delegation-candidates`, 'GET')?.route.rpcPattern).toBe(
      'tasks.delegation.candidates',
    );
    expect(findRoute(`/v1/tasks/${id}/review`, 'POST')?.route.rpcPattern).toBe(
      'tasks.reviewByDirector',
    );
    expect(findRoute('/v1/collaboration/director-reports', 'POST')?.route.rpcPattern).toBe(
      'collaboration.director.reportProgress',
    );
  });
});

