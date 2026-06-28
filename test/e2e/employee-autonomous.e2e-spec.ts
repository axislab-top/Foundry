// @ts-nocheck — 根目录 Jest
import type { CeoSupervisorState } from '@service/ai';
import { HierarchicalHeartbeatDynamicSubGraphRegistry } from '@service/ai';

describe('Phase2 W10 employee autonomous subgraph (e2e)', () => {
  it('registerEmployeeSubGraph + invokeStandalone completes quick_execute→report', async () => {
    const reg = new HierarchicalHeartbeatDynamicSubGraphRegistry();
    reg.registerEmployeeSubGraph();

    const base: CeoSupervisorState = {
      companyId: 'co-w10',
      tickAt: new Date().toISOString(),
      runKind: 'graph',
      goal: 'employee task',
      rootTaskId: undefined,
      traceId: 'trace-w10',
      supervisorRunId: 'trace-w10',
      triggerSource: 'collaboration_mention',
      triggerRef: 'msg-w10',
      contextBundle: JSON.stringify({ goalPreview: 'hello' }),
      hierarchicalMetaJson: '{}',
      planResultJson: '{}',
      createdTaskIdsJson: '[]',
      persistErrorsJson: '[]',
      llmMetaJson: '{}',
      skipPlanReason: '',
      mainRoomId: '',
      ceoAgentId: 'emp1',
      collaborationRoomId: 'room1',
      reportDraft: '',
    };

    const out = await reg.invokeStandaloneSubGraph('employee_autonomous', base);
    expect(out).toBeTruthy();
    const meta = JSON.parse(String(out!.hierarchicalMetaJson ?? '{}')) as Record<string, unknown>;
    expect((meta.employeeTaskGraph as Record<string, unknown>)?.phase).toBe('report');
  });

  it('invokeStandaloneSubGraphsParallel dedupes and runs multiple subgraph ids', async () => {
    const reg = new HierarchicalHeartbeatDynamicSubGraphRegistry();
    reg.registerEmployeeSubGraph();
    reg.registerDirectorSubGraph();

    const base: CeoSupervisorState = {
      companyId: 'co-w10b',
      tickAt: new Date().toISOString(),
      runKind: 'graph',
      goal: 'parallel',
      rootTaskId: undefined,
      traceId: 'trace-p',
      supervisorRunId: 'trace-p',
      triggerSource: 'collaboration_mention',
      triggerRef: 'm1',
      contextBundle: '{}',
      hierarchicalMetaJson: '{}',
      planResultJson: '{}',
      createdTaskIdsJson: '[]',
      persistErrorsJson: '[]',
      llmMetaJson: '{}',
      skipPlanReason: '',
      mainRoomId: '',
      ceoAgentId: 'emp1',
      collaborationRoomId: 'r1',
      reportDraft: '',
    };

    const outs = await reg.invokeStandaloneSubGraphsParallel(
      ['employee_autonomous', 'director_autonomous'],
      base,
    );
    expect(outs.length).toBe(2);
    expect(outs[0]?.reportDraft).toBeTruthy();
    expect(outs[1]?.reportDraft).toBeTruthy();
  });
});
