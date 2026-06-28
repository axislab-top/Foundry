// @ts-nocheck — 根目录 Jest + ts-jest；describe/it/expect 全局
import type { CeoSupervisorState } from '@service/ai';
import { HierarchicalHeartbeatDynamicSubGraphRegistry } from '@service/ai';

describe('Phase2 W9 director autonomous subgraph (e2e)', () => {
  it('registerDirectorSubGraph + invokeStandaloneSubGraph completes plan→report', async () => {
    const reg = new HierarchicalHeartbeatDynamicSubGraphRegistry();
    reg.registerDirectorSubGraph();

    const base: CeoSupervisorState = {
      companyId: 'co-w9',
      tickAt: new Date().toISOString(),
      runKind: 'graph',
      goal: 'line1\nline2',
      rootTaskId: undefined,
      traceId: 'trace-w9',
      supervisorRunId: 'trace-w9',
      triggerSource: 'collaboration_mention',
      triggerRef: 'msg-w9',
      contextBundle: JSON.stringify({
        subtasks: [
          { title: 'A', executorAgentId: 'ag1' },
          { title: 'B', executorAgentId: 'ag2' },
        ],
        roomId: 'room1',
        predictivePath: 'director',
      }),
      hierarchicalMetaJson: '{}',
      planResultJson: '{}',
      createdTaskIdsJson: '[]',
      persistErrorsJson: '[]',
      llmMetaJson: '{}',
      skipPlanReason: '',
      mainRoomId: '',
      ceoAgentId: 'dir1',
      collaborationRoomId: 'room1',
      reportDraft: '',
    };

    const out = await reg.invokeStandaloneSubGraph('director_autonomous', base);
    expect(out).toBeTruthy();
    const meta = JSON.parse(String(out!.hierarchicalMetaJson ?? '{}')) as Record<string, unknown>;
    expect((meta.directorTaskGraph as Record<string, unknown>)?.phase).toBe('report');
    expect(String(out!.reportDraft ?? '')).toContain('plan→assign→execute→report');
  });
});
