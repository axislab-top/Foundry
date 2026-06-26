import assert from 'node:assert/strict';
import { RuntimeContext } from './runtime-context.js';

const context = new RuntimeContext({
  traceId: 'trace-cls',
  companyId: 'company-cls',
  currentAgentId: 'agent-cls',
});

const result = await RuntimeContext.run(context, async () => {
  await new Promise((resolve) => setTimeout(resolve, 1));
  const current = RuntimeContext.current();
  return current?.traceId;
});

assert.equal(result, 'trace-cls');
assert.equal(RuntimeContext.current(), undefined);
