import assert from 'node:assert/strict';
import { LayeredLangGraphOrchestrator } from './layered-orchestrator.js';
import { RuntimeContext } from '../../runtime/runtime-context.js';

const dispatched: string[] = [];
const orchestrator = new LayeredLangGraphOrchestrator({
  dispatch: async (message) => {
    dispatched.push(String(message.intent));
  },
});

const result = await orchestrator.run(
  'ship phase3',
  new RuntimeContext({
    traceId: 'trace-layered',
    companyId: 'company-1',
    currentAgentId: 'ceo-1',
  }),
);

assert.equal(result.next, 'end');
assert.equal(dispatched.length >= 2, true);
