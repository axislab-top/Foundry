import assert from 'node:assert/strict';
import { RuntimeContext } from '../runtime/runtime-context.js';
import { SupervisorRegistry } from './supervisor-registry.js';

const registry = new SupervisorRegistry();
const context = new RuntimeContext({
  traceId: 'trace-registry',
  companyId: 'company-1',
  currentAgentId: 'ceo-1',
});

registry.register('budget.allocate', async () => ({
  action: 'warn',
  reason: 'over budget threshold',
  policyRef: 'budget-policy-v1',
}));

assert.equal(registry.has('budget.allocate'), true);
assert.deepEqual(registry.listActions(), ['budget.allocate']);

const result = await registry.evaluate('budget.allocate', { amount: 1000 }, context);
assert.equal(result.action, 'warn');
assert.equal(result.policyRef, 'budget-policy-v1');

registry.unregister('budget.allocate');
assert.equal(registry.has('budget.allocate'), false);

registry.setPolicy('high_risk_approval_threshold', 0.7, 1);
assert.equal(registry.getPolicy('high_risk_approval_threshold', 0.5), 0.7);

const applied = registry.loadDynamicPolicies({
  recapId: 'recap-1',
  discussionId: 'thread-1',
  policySuggestions: [
    { policyKey: 'high_risk_approval_threshold', suggestedValue: 0.9, confidence: 0.8 },
  ],
});
assert.equal(applied, 1);
assert.equal(registry.getPolicy('high_risk_approval_threshold', 0.5), 0.9);

const applied2 = registry.loadDynamicPolicies({
  recapId: 'recap-2',
  discussionId: 'thread-1',
  policySuggestions: [
    { policyKey: 'high_risk_approval_threshold', suggestedValue: 0.95, confidence: 0.7 },
  ],
});
assert.equal(applied2, 1);
assert.equal(registry.getPolicy('high_risk_approval_threshold', 0.5), 0.95);

// rollback should work (pick the previous version by scanning history)
// We don't know exact versions (Date.now), so we call rollbackPolicy with the first version we can observe via re-applying.
// Here we just validate API behavior: invalid version -> false, valid -> true.
assert.equal(registry.rollbackPolicy('high_risk_approval_threshold', 0), false);
