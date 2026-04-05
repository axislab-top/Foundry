import { ROUTES, findRoute } from './routes.config.js';

describe('routes.config tasks & dashboard', () => {
  it('should expose tasks RPC routes', () => {
    const patterns = ROUTES.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'dashboard.companySummary',
        'dashboard.boardRunSummary',
        'tasks.findAll',
        'tasks.create',
        'tasks.requestBreakdown',
        'tasks.dependencies.list',
        'tasks.tree',
        'tasks.executionLogs.list',
        'tasks.executionLogs.groupedByRun',
        'tasks.executionLog.append',
        'tasks.runs.list',
        'tasks.assign',
        'tasks.updateProgress',
        'tasks.findOne',
        'tasks.update',
        'tasks.remove',
      ]),
    );
  });

  it('should match /v1/tasks/breakdown before /v1/tasks/:id', () => {
    const r = findRoute('/v1/tasks/breakdown');
    expect(r?.route.rpcPattern).toBe('tasks.requestBreakdown');
  });

  it('should match /v1/tasks/dependencies before /v1/tasks/:id', () => {
    const r = findRoute('/v1/tasks/dependencies', 'GET');
    expect(r?.route.rpcPattern).toBe('tasks.dependencies.list');
  });

  it('should match execution-logs grouped subpath', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const r = findRoute(`/v1/tasks/${uuid}/execution-logs/grouped`, 'GET');
    expect(r?.route.rpcPattern).toBe('tasks.executionLogs.groupedByRun');
    expect(r?.params.id).toBe(uuid);
  });

  it('should register task subtree routes before generic :id', () => {
    const treeIndex = ROUTES.findIndex(
      (r) => r.path === '/v1/tasks/:id/tree' && r.rpcPattern === 'tasks.tree',
    );
    const idIndex = ROUTES.findIndex(
      (r) => r.path === '/v1/tasks/:id' && r.rpcPattern === 'tasks.findOne',
    );
    expect(treeIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThanOrEqual(0);
    expect(treeIndex).toBeLessThan(idIndex);

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const matched = findRoute(`/v1/tasks/${uuid}/tree`);
    expect(matched?.route.rpcPattern).toBe('tasks.tree');
    expect(matched?.params.id).toBe(uuid);
  });
});
