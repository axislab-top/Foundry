import { buildCeoHeartbeatGraph } from '../../../../../infrastructure/ai/src/autonomous/build-ceo-heartbeat-graph.js';

describe('langgraph buildCeoHeartbeatGraph', () => {
  it('runs full pipeline and persists thread via checkpointer', async () => {
    const graph = buildCeoHeartbeatGraph({
      ingest: async () => ({
        contextBundle: JSON.stringify({ seeded: true }),
        ceoAgentId: 'ceo-1',
      }),
      plan: async () => ({
        planResultJson: JSON.stringify({
          summary: 'plan',
          tasks: [],
          requiresHumanApproval: false,
        }),
      }),
      validatePersist: async () => ({
        createdTaskIdsJson: '[]',
        persistErrorsJson: '[]',
      }),
      summarize: async (state) => ({
        reportDraft: `ok:${state.companyId}`,
      }),
      notify: async () => ({}),
    });

    const threadId = 'ceo:test-co:heartbeat:trace-1';
    const out = await graph.invoke(
      {
        companyId: 'test-co',
        tickAt: '2026-03-29T12:00:00.000Z',
        runKind: 'heartbeat',
        goal: '',
        rootTaskId: undefined,
        traceId: 'trace-1',
        supervisorRunId: 'trace-1',
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
      { configurable: { thread_id: threadId } },
    );

    expect(out.reportDraft).toBe('ok:test-co');

    const state = await graph.getState({ configurable: { thread_id: threadId } });
    expect(state.values.reportDraft).toBe('ok:test-co');
  });
});
