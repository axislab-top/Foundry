import {
  planPhaseAfterDispatchFlush,
  planPhaseAfterPlanGenerated,
  planProgramSyncForWorkCommand,
} from './program-work-command-sync.util.js';

describe('program-work-command-sync.util', () => {
  it('maps dispatch_plan to planning phase', () => {
    const plan = planProgramSyncForWorkCommand({
      command: {
        kind: 'dispatch_plan',
        goalSummary: '做一份年度分析报告',
        heavyKind: 'dispatch_plan_compile_and_flush',
        autoFlush: true,
        needsUserConfirm: false,
        reason: 'authorized',
      },
      program: null,
      traceId: 'trace-1',
    });
    expect(plan?.toPhase).toBe('ready_to_plan');
    expect(plan?.timelineKind).toBe('work_command');
  });

  it('maps flush_pending to dispatching', () => {
    const plan = planProgramSyncForWorkCommand({
      command: { kind: 'flush_pending', goalSummary: null, reason: 'confirm' },
      program: {
        id: 'p1',
        companyId: 'c1',
        roomId: 'r1',
        threadId: 'main',
        sourceMessageId: 'm1',
        phase: 'pending_confirm',
        brief: {
          deliverableType: 'deliverable',
          title: null,
          audience: null,
          timeframe: null,
          persona: null,
          purpose: null,
          completeness: 0,
          missingFields: [],
        },
        lifecycle: 'awaiting_confirm',
        createdAt: '',
        updatedAt: '',
      },
    });
    expect(plan?.toPhase).toBe('dispatching');
  });

  it('plan generated moves to pending_confirm when needed', () => {
    expect(
      planPhaseAfterPlanGenerated({ programPhase: 'planning', pendingDistributionConfirm: true }),
    ).toBe('pending_confirm');
    expect(
      planPhaseAfterPlanGenerated({ programPhase: 'pending_confirm', pendingDistributionConfirm: true }),
    ).toBeNull();
  });

  it('dispatch flush moves to dept_executing', () => {
    expect(planPhaseAfterDispatchFlush('dispatching')).toBe('dept_executing');
    expect(planPhaseAfterDispatchFlush('dept_executing')).toBeNull();
  });
});
