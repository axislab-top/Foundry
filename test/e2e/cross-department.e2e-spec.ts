// @ts-nocheck — 根目录 Jest + ts-jest；describe/it/expect 全局
import type { CeoSupervisorState } from '@service/ai';
import { HierarchicalHeartbeatDynamicSubGraphRegistry } from '@service/ai';

describe('Phase2 W11 L2 cross-department graph (e2e)', () => {
  it('registerL2CrossDeptGraph + invokeStandalone runs detect→parallel→aggregate', async () => {
    const reg = new HierarchicalHeartbeatDynamicSubGraphRegistry();
    reg.registerDirectorSubGraph();
    reg.registerEmployeeSubGraph();
    reg.registerL2CrossDeptGraph();

    const base: CeoSupervisorState = {
      companyId: 'co-w11',
      tickAt: new Date().toISOString(),
      runKind: 'graph',
      goal: '跨部门协调 review',
      rootTaskId: undefined,
      traceId: 'trace-w11',
      supervisorRunId: 'trace-w11',
      triggerSource: 'collaboration_mention',
      triggerRef: 'msg-w11',
      contextBundle: JSON.stringify({
        crossDepartmentSignal: true,
        contentPreview: 'cross-dept sync',
        targetDepartmentNodeIds: ['dept-a', 'dept-b'],
        mentionedNodeIds: ['dept-a', 'dept-b'],
        l2ParallelSubGraphIds: ['director_autonomous', 'employee_autonomous'],
      }),
      hierarchicalMetaJson: '{}',
      planResultJson: '{}',
      createdTaskIdsJson: '[]',
      persistErrorsJson: '[]',
      llmMetaJson: '{}',
      skipPlanReason: '',
      mainRoomId: '',
      ceoAgentId: 'actor-w11',
      collaborationRoomId: 'room-w11',
      reportDraft: '',
    };

    const out = await reg.invokeStandaloneSubGraph('l2_cross_department', base);
    expect(out).toBeTruthy();
    const meta = JSON.parse(String(out!.hierarchicalMetaJson ?? '{}')) as Record<string, unknown>;
    const l2 = meta.l2CrossDepartment as Record<string, unknown> | undefined;
    expect(l2?.phase).toBe('aggregateReport');
    expect(Array.isArray(meta.l2ParallelResults)).toBe(true);
    expect(String(out!.reportDraft ?? '')).toContain('[L2 Cross-Department] aggregateReport');
  });
});
