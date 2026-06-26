import assert from 'node:assert/strict';
import { createAgentMessage, MessageIntent } from './agent-message.contract.js';

const message = createAgentMessage({
  traceId: 'trace-1',
  fromAgentId: 'ceo',
  toAgentId: 'dept',
  intent: MessageIntent.TASK_DELEGATE,
  payload: { task: 't1' },
  context: { companyId: 'company-1' },
});

assert.equal(message.traceId, 'trace-1');
assert.ok(message.messageId.length > 0);
assert.ok(message.idempotencyKey?.includes(message.traceId));
