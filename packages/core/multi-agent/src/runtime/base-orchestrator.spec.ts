import assert from 'node:assert/strict';
import { BaseOrchestrator } from './base-orchestrator.js';
import { RuntimeContext } from './runtime-context.js';
import type { TaskDelegationRequest } from './types.js';

class TestOrchestrator extends BaseOrchestrator {
  protected async breakdown(_goal: string): Promise<TaskDelegationRequest[]> {
    return [
      {
        taskId: 'task-1',
        executorAgentId: 'agent-a',
        inputs: { topic: 'kpi' },
      },
    ];
  }
}

const context = new RuntimeContext({
  traceId: 'trace-orch',
  companyId: 'company-1',
  currentAgentId: 'ceo-1',
});

let dispatchedMessageId = '';
const orchestrator = new TestOrchestrator(
  context,
  { enableSupervision: true, maxRetries: 2 },
  {
    supervise: async () => ({ action: 'allow', reason: 'ok' }),
    dispatchMessage: async (message) => {
      dispatchedMessageId = message.messageId;
    },
    waitForDelegationResult: async (taskId) => ({ taskId, status: 'completed' }),
  },
);

const result = await orchestrator.orchestrate('ship phase2');

assert.equal(result.success, true);
assert.equal(Array.isArray(result.data), true);
assert.equal((result.data?.[0] as { taskId?: string }).taskId, 'task-1');
assert.equal(dispatchedMessageId.length > 0, true);
assert.equal(result.traceEvents.some((event) => event.type === 'orchestrator.delegated'), true);
