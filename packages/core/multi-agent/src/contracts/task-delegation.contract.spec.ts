import assert from 'node:assert/strict';
import { TaskDelegationSchema } from './task-delegation.contract.js';

const delegation = TaskDelegationSchema.parse({
  taskId: 'task-1',
  ownerAgentId: 'ceo',
  executorAgentId: 'specialist',
  inputs: { objective: 'ship feature' },
});

assert.equal(delegation.status, 'queued');
assert.deepEqual(delegation.dependsOn, []);
