// @ts-nocheck — 根目录 Jest + ts-jest
import type { CeoSupervisorState } from '@service/ai';
import { HierarchicalHeartbeatDynamicSubGraphRegistry } from '@service/ai';

/**
 * W12：Phase2「团队协同」编排契约 smoke — 无 MQ，仅校验 Registry + 事件常量生产路径一致。
 */
describe('Phase2 W12 full autonomous team graph (e2e)', () => {
  it('registers director + employee + L2 and invokes parallel standalone subgraphs', async () => {
    const reg = new HierarchicalHeartbeatDynamicSubGraphRegistry();
    reg.registerDirectorSubGraph();
    reg.registerEmployeeSubGraph();
    reg.registerL2CrossDeptGraph();

    const base: CeoSupervisorState = {
      companyId: 'co-w12',
      tickAt: new Date().toISOString(),
      runKind: 'graph',
      goal: '跨部门团队协同',
      rootTaskId: undefined,
      traceId: 'trace-w12',
      supervisorRunId: 'trace-w12',
      triggerSource: 'collaboration_mention',
      triggerRef: 'msg-w12',
      contextBundle: JSON.stringify({
        crossDepartmentSignal: true,
        targetDepartmentNodeIds: ['d1', 'd2'],
        l2ParallelSubGraphIds: ['director_autonomous', 'employee_autonomous'],
      }),
      hierarchicalMetaJson: '{}',
      planResultJson: '{}',
      createdTaskIdsJson: '[]',
      persistErrorsJson: '[]',
      llmMetaJson: '{}',
      skipPlanReason: '',
      mainRoomId: '',
      ceoAgentId: 'ceo-w12',
      collaborationRoomId: 'room-w12',
      reportDraft: '',
    };

    const parallel = await reg.invokeStandaloneSubGraphsParallel(
      ['director_autonomous', 'employee_autonomous'],
      base,
    );
    expect(parallel.length).toBe(2);

    const l2Out = await reg.invokeStandaloneSubGraph('l2_cross_department', base);
    expect(l2Out?.reportDraft).toContain('[L2 Cross-Department] aggregateReport');
  });
});
