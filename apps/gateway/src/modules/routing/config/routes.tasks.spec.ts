import { ROUTES, findRoute } from './routes.config.js';

describe('routes.config tasks & dashboard', () => {
  it('should expose tasks RPC routes', () => {
    const patterns = ROUTES.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'dashboard.companySummary',
        'dailyBrief.getForUser',
        'dashboard.boardRunSummary',
        'tasks.findAll',
        'tasks.create',
        'tasks.requestBreakdown',
        'tasks.dependencies.list',
        'tasks.tree',
        'tasks.executionLogs.list',
        'tasks.executionLogs.listByRunId',
        'tasks.executionLogs.groupedByRun',
        'tasks.executionLog.append',
        'tasks.runs.list',
        'tasks.runs.get',
        'tasks.runs.intervene',
        'observability.trace.listByRunId',
        'tasks.assign',
        'tasks.delegateByDirector',
        'tasks.reviewByDirector',
        'tasks.updateProgress',
        'tasks.departmentPipeline.createSequential',
        'tasks.departmentPipeline.crossDepartmentHandoff',
        'tasks.supervision.resolve',
        'tasks.chat.dispatchToDepartment',
        'tasks.chat.reportToMain',
        'tasks.chat.requestCoordination',
        'tasks.goals.listByRoom',
        'tasks.goals.ensureMain',
        'tasks.goals.assignToDepartmentDirector',
        'tasks.goals.closeRound',
        'tasks.goals.completeMainRoomDistributionChild',
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

  it('should match task-runs execution-logs by runId', () => {
    const runId = '660e8400-e29b-41d4-a716-446655440001';
    const r = findRoute(`/v1/task-runs/${runId}/execution-logs`, 'GET');
    expect(r?.route.rpcPattern).toBe('tasks.executionLogs.listByRunId');
    expect(r?.params.runId).toBe(runId);
  });

  it('should match task-runs trace-events by runId', () => {
    const runId = '660e8400-e29b-41d4-a716-446655440002';
    const r = findRoute(`/v1/task-runs/${runId}/trace-events`, 'GET');
    expect(r?.route.rpcPattern).toBe('observability.trace.listByRunId');
    expect(r?.params.runId).toBe(runId);
  });

  it('should match task-runs get by runId', () => {
    const runId = '660e8400-e29b-41d4-a716-446655440003';
    const r = findRoute(`/v1/task-runs/${runId}`, 'GET');
    expect(r?.route.rpcPattern).toBe('tasks.runs.get');
    expect(r?.params.runId).toBe(runId);
  });

  it('should match task-runs interventions by runId', () => {
    const runId = '660e8400-e29b-41d4-a716-446655440004';
    const r = findRoute(`/v1/task-runs/${runId}/interventions`, 'POST');
    expect(r?.route.rpcPattern).toBe('tasks.runs.intervene');
    expect(r?.params.runId).toBe(runId);
  });

  it('should match execution-logs grouped subpath', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const r = findRoute(`/v1/tasks/${uuid}/execution-logs/grouped`, 'GET');
    expect(r?.route.rpcPattern).toBe('tasks.executionLogs.groupedByRun');
    expect(r?.params.id).toBe(uuid);
  });

  it('should match department-pipeline routes before generic /v1/tasks/:id', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440020';
    expect(findRoute(`/v1/tasks/${uuid}/department-pipeline/sequential`, 'POST')?.route.rpcPattern).toBe(
      'tasks.departmentPipeline.createSequential',
    );
    expect(findRoute(`/v1/tasks/${uuid}/department-pipeline/handoff`, 'POST')?.route.rpcPattern).toBe(
      'tasks.departmentPipeline.crossDepartmentHandoff',
    );
    expect(findRoute(`/v1/tasks/${uuid}/supervision/resolve`, 'POST')?.route.rpcPattern).toBe(
      'tasks.supervision.resolve',
    );
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

  it('should match task goal routes', () => {
    const roomId = '550e8400-e29b-41d4-a716-446655440009';
    const taskId = '550e8400-e29b-41d4-a716-446655440010';
    expect(findRoute(`/v1/tasks/goals/by-room/${roomId}`, 'GET')?.route.rpcPattern).toBe(
      'tasks.goals.listByRoom',
    );
    expect(findRoute('/v1/tasks/goals/ensure-main', 'POST')?.route.rpcPattern).toBe(
      'tasks.goals.ensureMain',
    );
    expect(findRoute(`/v1/tasks/${taskId}/goals/assign`, 'POST')?.route.rpcPattern).toBe(
      'tasks.goals.assignToDepartmentDirector',
    );
    expect(findRoute(`/v1/tasks/${taskId}/goals/close-round`, 'POST')?.route.rpcPattern).toBe(
      'tasks.goals.closeRound',
    );
    expect(findRoute(`/v1/tasks/${taskId}/goals/complete-main-room-distribution`, 'POST')?.route.rpcPattern).toBe(
      'tasks.goals.completeMainRoomDistributionChild',
    );
  });
});
