import { buildHierarchicalHeartbeatGraph } from '../../../../../infrastructure/ai/src/autonomous/build-hierarchical-heartbeat-graph.js';

describe('langgraph buildHierarchicalHeartbeatGraph', () => {
  it('runs ingest through hierarchicalExpand to notify', async () => {
    const graph = buildHierarchicalHeartbeatGraph({
      ingest: async () => ({
        contextBundle: JSON.stringify({ seeded: true }),
        ceoAgentId: 'ceo-1',
      }),
      plan: async () => ({
        planResultJson: JSON.stringify({
          summary: 'plan',
          tasks: [{ title: 't1', organizationNodeId: '00000000-0000-4000-8000-000000000099' }],
          requiresHumanApproval: false,
        }),
      }),
      hierarchicalExpand: async (state) => ({
        planResultJson: JSON.stringify({
          summary: 'plan',
          tasks: [
            {
              title: 't1',
              organizationNodeId: '00000000-0000-4000-8000-000000000099',
              assigneeAgentId: '00000000-0000-4000-8000-0000000000aa',
            },
          ],
          requiresHumanApproval: false,
        }),
        hierarchicalMetaJson: JSON.stringify({ autoAssigned: [], errors: [] }),
      }),
      validatePersist: async () => ({
        createdTaskIdsJson: '["task-1"]',
        persistErrorsJson: '[]',
      }),
      summarize: async (state) => ({
        reportDraft: `ok:${state.companyId}`,
      }),
      notify: async () => ({}),
    });

    const out = await graph.invoke(
      {
        companyId: 'test-co',
        tickAt: '2026-03-29T12:00:00.000Z',
        runKind: 'heartbeat',
        goal: '',
        rootTaskId: undefined,
        traceId: 'trace-h1',
        supervisorRunId: 'trace-h1',
        triggerSource: 'schedule',
        triggerRef: '',
        contextBundle: '',
        planResultJson: '{}',
        createdTaskIdsJson: '[]',
        persistErrorsJson: '[]',
        llmMetaJson: '{}',
        skipPlanReason: '',
        hierarchicalMetaJson: '{}',
        mainRoomId: '',
        ceoAgentId: '',
        reportDraft: '',
      },
      { configurable: { thread_id: 'ceo:test-co:heartbeat:trace-h1' } },
    );

    expect(out.reportDraft).toBe('ok:test-co');
  });
});
