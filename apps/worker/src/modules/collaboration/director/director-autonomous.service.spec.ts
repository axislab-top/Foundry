import { of } from 'rxjs';
import type { EmployeeDeptReportPayload } from '@contracts/types';

import { DirectorAutonomousService } from './director-autonomous.service.js';

import type { L1FeatureFlagService } from '../l1/l1-feature-flag.service.js';

import type { ConfigService } from '../../../common/config/config.service.js';



describe('DirectorAutonomousService', () => {

  function setup(opts: {

    globalDirector?: boolean;

    companyDirector?: boolean;

    graphV2?: boolean;

    graphBundle?: boolean;

    registry?: { invokeStandaloneSubGraph: jest.Mock };

    executeDirectText?: string;

    classificationOutline?: Array<{ title: string; suggestedExecutorAgentId?: string }>;

  }) {

    const config = {

      isDirectorAutonomousEnabled: () => opts.globalDirector ?? true,

      isMultiAgentGraphV2Enabled: () => opts.graphV2 ?? false,

      isCrossDepartmentCoordinationEnabled: () => false,

      getCollaborationMentionRpcTimeoutMs: () => 5000,

      getWorkerActorUserId: () => 'worker',

    } as unknown as ConfigService;



    const l1Flags = {

      isDirectorAutonomousEffective: jest.fn().mockResolvedValue(opts.companyDirector ?? true),

      isDirectorAutonomousGraphBundleEffective: jest.fn().mockResolvedValue(opts.graphBundle ?? false),

      isCrossDepartmentCoordinationEffective: jest.fn().mockResolvedValue(false),

    } as unknown as L1FeatureFlagService;



    const publish = jest.fn().mockResolvedValue(undefined);

    const messaging = { publish } as any;



    const rpc = jest.fn().mockImplementation((pattern: string) => {

      if (pattern === 'collaboration.messages.appendAgent') return of({});

      return of({});

    });

    const apiRpc = { send: rpc } as any;



    const registry =

      opts.registry ??

      ({

        invokeStandaloneSubGraph: jest.fn().mockResolvedValue({

          reportDraft: 'subgraph done',

          hierarchicalMetaJson: JSON.stringify({ directorTaskGraph: { phase: 'report' } }),

        }),

      } as any);



    const deptReportBuffer = {

      listEmployeeReports: jest.fn().mockResolvedValue([]),

      storeEmployeeReport: jest.fn().mockResolvedValue(undefined),

      storeDirectorReport: jest.fn().mockResolvedValue(undefined),

    } as any;

    const deptReports = {

      publishDirectorDeptReport: jest.fn().mockResolvedValue({}),

      publishEmployeeDeptReport: jest.fn().mockResolvedValue({}),

    } as any;

    const agentExecution = {

      executeDirect: jest.fn().mockResolvedValue({
        text: opts.executeDirectText ?? '已安排子任务。',
        truncatedByLength: false,
        continuationRounds: 0,
        extremeCapApplied: false,
        originalCharLength: String(opts.executeDirectText ?? '已安排子任务。').length,
      }),

    } as any;

    const orgContextPack = {

      listDepartmentEmployeeAgentIds: jest.fn().mockResolvedValue(['emp1', 'emp2']),

    } as any;

    const departmentClassifier = {

      classify: jest.fn().mockResolvedValue({

        interactionMode: 'delegate_tasks',

        targetAgentIds: ['dir1'],

        confidence: 0.88,

        explanation: 'test',

        delegationOutline: opts.classificationOutline ?? [

          { title: '子任务A', suggestedExecutorAgentId: 'emp1' },

          { title: '子任务B', suggestedExecutorAgentId: 'emp2' },

        ],

        llmUsed: true,

        classifierFallback: false,

      }),

    } as any;



    const dispatchTimeline = {
      relayDirectorAckToMainRoom: jest.fn().mockResolvedValue({ ok: true }),
    } as any;

    const responderThinking = {
      publishBestEffort: jest.fn(),
    } as any;

    const employeeExecutionSvc = {
      executeSkill: jest.fn(),
    } as any;

    const orchestrationPause = {
      isPaused: jest.fn().mockResolvedValue(false),
    } as any;

    const dispatchDeliverableQc = {
      isEnabled: () => false,
      reviewDirectorDeptEvidence: jest.fn(),
      shouldTriggerRework: jest.fn(),
      recordReworkAttempt: jest.fn(),
      logQcOutcome: jest.fn(),
    } as any;

    const dispatchCompensation = {
      appendAgentWithRetry: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      notifyDispatchPartialFailure: jest.fn(),
      notifyAppendFailure: jest.fn(),
    } as any;

    const svc = new DirectorAutonomousService(

      config,

      l1Flags,

      messaging,

      apiRpc,

      deptReportBuffer,

      deptReports,

      agentExecution,

      orgContextPack,

      departmentClassifier,

      dispatchTimeline,

      responderThinking,

      employeeExecutionSvc,

      orchestrationPause,

      dispatchDeliverableQc,

      dispatchCompensation,

      {} as any,

      registry,

    );



    return { svc, publish, rpc, registry, agentExecution, departmentClassifier, l1Flags };

  }



  it('tryHandleL2GoalDispatched publishes delegations with parentTaskId', async () => {

    const { svc, publish } = setup({});

    const r = await svc.tryHandleL2GoalDispatched({

      companyId: 'co1',

      roomId: 'dept-room',

      subGoalTaskId: 'l2-sub-1',

      directorAgentId: 'dir1',

      deliverable: '完成市场调研',

      roomContext: {

        companyId: 'co1',

        roomId: 'dept-room',

        organizationNodeId: 'node1',

        members: [

          { memberType: 'agent', memberId: 'dir1' },

          { memberType: 'agent', memberId: 'emp1' },

          { memberType: 'agent', memberId: 'emp2' },

        ],

        memberDirectory: [

          { memberType: 'agent', memberId: 'emp1', displayName: 'E1', roleLabel: 'employee' },

          { memberType: 'agent', memberId: 'emp2', displayName: 'E2', roleLabel: 'employee' },

        ],

      } as any,

    });

    expect(r.handled).toBe(true);

    expect(publish).toHaveBeenCalled();

    const payload = publish.mock.calls[0]![0] as {

      data?: { delegation?: { parentTaskId?: string; inputs?: { l2SubGoalTaskId?: string } } };

    };

    expect(payload.data?.delegation?.parentTaskId).toBe('l2-sub-1');

    expect(payload.data?.delegation?.inputs?.l2SubGoalTaskId).toBe('l2-sub-1');

  });



  it('executeDepartmentDelegation publishes and uses LLM reply text', async () => {

    const { svc, publish, rpc, agentExecution } = setup({ executeDirectText: '好的，已拆解安排。' });

    const r = await svc.executeDepartmentDelegation({

      companyId: 'co1',

      roomId: 'room1',

      messageId: 'msg1',

      threadId: null,

      contentText: '请拆解并安排',

      directorAgentId: 'dir1',

      roomContext: {

        organizationNodeId: 'node1',

        members: [{ memberType: 'agent', memberId: 'dir1' }],

        memberDirectory: [

          { memberType: 'agent', memberId: 'emp1', roleLabel: 'employee', displayName: 'E1' },

        ],

      } as any,

      delegationOutline: [{ title: '任务一', suggestedExecutorAgentId: 'emp1' }],

    });

    expect(r.handled).toBe(true);

    expect(publish).toHaveBeenCalled();

    expect(agentExecution.executeDirect).toHaveBeenCalled();

    const append = (rpc as jest.Mock).mock.calls.find((c) => c[0] === 'collaboration.messages.appendAgent');

    expect(String(append![1].content)).not.toContain('[部门自主 W9]');

    expect(String(append![1].content)).toContain('已拆解安排');

  });



  it('skips delegation when global DIRECTOR_AUTONOMOUS flag off', async () => {

    const { svc, publish } = setup({ globalDirector: false });

    const r = await svc.executeDepartmentDelegation({

      companyId: 'co1',

      roomId: 'room1',

      messageId: 'msg1',

      threadId: null,

      contentText: 'test',

      directorAgentId: 'dir1',

      roomContext: { members: [] } as any,

      delegationOutline: [{ title: 'x' }],

    });

    expect(r.handled).toBe(false);

    expect(publish).not.toHaveBeenCalled();

  });

  it('tryHandleL2GoalDispatched bypasses phase1 rollout when bypassPhase1Rollout=true', async () => {
    const { svc, rpc, l1Flags } = setup({ globalDirector: true, companyDirector: false });
    (l1Flags.isDirectorAutonomousEffective as jest.Mock).mockResolvedValue(false);
    const r = await svc.tryHandleL2GoalDispatched({
      companyId: 'co1',
      roomId: 'dept-room',
      subGoalTaskId: 'sub-1',
      directorAgentId: 'dir1',
      deliverable: '完成产品需求定义',
      roomContext: {
        organizationNodeId: 'node1',
        members: [{ memberType: 'agent', memberId: 'dir1' }],
        memberDirectory: [{ memberType: 'agent', memberId: 'emp1', roleLabel: 'employee', displayName: 'E1' }],
      } as any,
      bypassPhase1Rollout: true,
    });
    expect(r.handled).toBe(true);
    expect(l1Flags.isDirectorAutonomousEffective).not.toHaveBeenCalled();
    const append = (rpc as jest.Mock).mock.calls.find((c) => c[0] === 'collaboration.messages.appendAgent');
    expect(append).toBeTruthy();
  });

});

describe('DirectorAutonomousService.tryAggregateEmployeeDeptReports', () => {
  function makeReport(taskId: string, status: 'ok' | 'failed' = 'ok'): EmployeeDeptReportPayload {
    return {
      version: 1,
      companyId: 'co1',
      traceId: 'dist-1',
      taskId,
      distributionId: 'dist-1',
      department: 'product',
      agentId: `emp-${taskId}`,
      directorAgentId: 'dir1',
      roomId: 'dept-room',
      status,
      summary: `report ${taskId}`,
      reportedAt: new Date().toISOString(),
    };
  }

  function makeAggregateSvc(opts: {
    employeeReports: EmployeeDeptReportPayload[];
    expectedDelegations?: number | null;
    requireAllDelegations?: boolean;
    requireDeliverable?: boolean;
    qcEnabled?: boolean;
    qcDecision?: 'pass' | 'rework';
  }) {
    const config = {
      isCollabL2AutoCompleteRequireDeliverable: () => opts.requireDeliverable ?? false,
      isCollabL2RequireAllDelegations: () => opts.requireAllDelegations ?? true,
      isCollabDeptSupervisionReportInRoomEnabled: () => false,
      getCollaborationMentionRpcTimeoutMs: () => 5000,
      getWorkerActorUserId: () => 'worker',
    } as unknown as ConfigService;

    const deptReportBuffer = {
      listEmployeeReports: jest.fn().mockResolvedValue(opts.employeeReports),
      getExpectedDelegations: jest.fn().mockResolvedValue(opts.expectedDelegations ?? null),
    } as any;

    const publishDirectorDeptReport = jest.fn().mockResolvedValue({});
    const deptReports = { publishDirectorDeptReport } as any;

    const dispatchDeliverableQc = {
      isEnabled: () => opts.qcEnabled ?? false,
      reviewDirectorDeptEvidence: jest.fn().mockResolvedValue({
        decision: opts.qcDecision ?? 'pass',
        summary: '交付物未通过质检',
        failureReason: 'llm_qc_fail',
        reworkCount: 0,
      }),
      shouldTriggerRework: jest.fn().mockReturnValue((opts.qcDecision ?? 'pass') === 'rework'),
      recordReworkAttempt: jest.fn().mockResolvedValue(1),
      logQcOutcome: jest.fn(),
    } as any;

    const dispatchCompensation = {
      appendAgentWithRetry: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      notifyDispatchPartialFailure: jest.fn(),
      notifyAppendFailure: jest.fn(),
    } as any;

    const svc = new DirectorAutonomousService(
      config,
      {} as any,
      { publish: jest.fn() } as any,
      { send: jest.fn(() => of({})) } as any,
      deptReportBuffer,
      deptReports,
      { executeDirect: jest.fn(), executeSkill: jest.fn() } as any,
      {} as any,
      {} as any,
      { relayDirectorAckToMainRoom: jest.fn(), resolveMainRoomIdForCompany: jest.fn().mockResolvedValue('') } as any,
      { publishBestEffort: jest.fn() } as any,
      {} as any,
      { isPaused: jest.fn().mockResolvedValue(false) } as any,
      dispatchDeliverableQc,
      dispatchCompensation,
      {} as any,
    );

    return { svc, publishDirectorDeptReport, dispatchDeliverableQc, dispatchCompensation };
  }

  it('does not readyForSupervision when only 1 of 3 expected delegations reported', async () => {
    const { svc, publishDirectorDeptReport } = makeAggregateSvc({
      employeeReports: [makeReport('t1')],
      expectedDelegations: 3,
    });
    await svc.tryAggregateEmployeeDeptReports({ companyId: 'co1', report: makeReport('t1') });
    expect(publishDirectorDeptReport).toHaveBeenCalledWith(
      expect.objectContaining({ readyForSupervision: false, status: 'partial' }),
    );
  });

  it('readyForSupervision when all expected delegations reported', async () => {
    const reports = [makeReport('t1'), makeReport('t2'), makeReport('t3')];
    const { svc, publishDirectorDeptReport } = makeAggregateSvc({
      employeeReports: reports,
      expectedDelegations: 3,
    });
    await svc.tryAggregateEmployeeDeptReports({ companyId: 'co1', report: makeReport('t3') });
    expect(publishDirectorDeptReport).toHaveBeenCalledWith(
      expect.objectContaining({ readyForSupervision: true, status: 'ok' }),
    );
  });

  it('allows early partial when COLLAB_L2_REQUIRE_ALL_DELEGATIONS off', async () => {
    const { svc, publishDirectorDeptReport } = makeAggregateSvc({
      employeeReports: [makeReport('t1')],
      expectedDelegations: 3,
      requireAllDelegations: false,
    });
    await svc.tryAggregateEmployeeDeptReports({ companyId: 'co1', report: makeReport('t1') });
    expect(publishDirectorDeptReport).toHaveBeenCalledWith(
      expect.objectContaining({ readyForSupervision: true, status: 'ok' }),
    );
  });

  it('blocks readyForSupervision and triggers rework when QC fails', async () => {
    const reports = [makeReport('t1'), makeReport('t2'), makeReport('t3')];
    const { svc, publishDirectorDeptReport, dispatchCompensation } = makeAggregateSvc({
      employeeReports: reports,
      expectedDelegations: 3,
      qcEnabled: true,
      qcDecision: 'rework',
    });
    await svc.tryAggregateEmployeeDeptReports({ companyId: 'co1', report: makeReport('t3') });
    expect(publishDirectorDeptReport).toHaveBeenCalledWith(
      expect.objectContaining({
        readyForSupervision: false,
        blockers: expect.arrayContaining(['deliverable_qc_failed']),
      }),
    );
    expect(dispatchCompensation.appendAgentWithRetry).toHaveBeenCalled();
  });
});

