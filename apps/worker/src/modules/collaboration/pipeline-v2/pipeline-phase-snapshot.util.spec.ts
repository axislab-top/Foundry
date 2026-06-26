import {
  buildDepartmentPipelinePhases,
  buildMainRoomPipelinePhases,
} from './pipeline-phase-snapshot.util.js';

describe('pipeline-phase-snapshot.util', () => {
  it('buildMainRoomPipelinePhases marks running stage from before_runMainRoomFlow', () => {
    const phases = buildMainRoomPipelinePhases({
      orchestrationStatus: 'running',
      stage: 'before_runMainRoomFlow',
      routePath: 'orchestration',
    });
    const intent = phases.find((p) => p.id === 'intent');
    const replay = phases.find((p) => p.id === 'replay');
    expect(intent?.status).toBe('running');
    expect(replay?.status).not.toBe('done');
  });

  it('buildMainRoomPipelinePhases marks all done on completed lifecycle', () => {
    const phases = buildMainRoomPipelinePhases({
      orchestrationStatus: 'succeeded',
      lifecycle: 'completed',
      stage: 'supervision',
      routePath: 'supervision',
      executionStateStages: ['proposed', 'approved', 'in_progress', 'done'],
    });
    expect(phases.every((p) => p.status === 'done')).toBe(true);
  });

  it('buildMainRoomPipelinePhases keeps dept_exec running on dept_executing lifecycle', () => {
    const phases = buildMainRoomPipelinePhases({
      orchestrationStatus: 'running',
      lifecycle: 'dept_executing',
      stage: 'dispatch_plan_flush',
      routePath: 'dispatch_plan_flush',
    });
    expect(phases.find((p) => p.id === 'dispatch')?.status).toBe('done');
    expect(phases.find((p) => p.id === 'dept_exec')?.status).toBe('running');
    expect(phases.find((p) => p.id === 'supervision')?.status).toBe('pending');
  });

  it('buildDepartmentPipelinePhases marks delegate done when delegations published', () => {
    const phases = buildDepartmentPipelinePhases({
      orchestrationStatus: 'running',
      stage: 'director_autonomous',
      delegationsPublished: 2,
      subGoalCount: 1,
    });
    expect(phases.find((p) => p.id === 'dept_receive')?.status).toBe('done');
    expect(phases.find((p) => p.id === 'dept_delegate')?.status).toBe('done');
    expect(phases.find((p) => p.id === 'dept_exec')?.status).toBe('running');
  });
});
