import assert from 'node:assert/strict';
import { dependencyGraphHasCycle, validateTaskDependencyRows } from './index.js';

assert.equal(dependencyGraphHasCycle([]), false);
assert.equal(
  dependencyGraphHasCycle([
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ]),
  false,
);
assert.equal(
  dependencyGraphHasCycle([
    { from: 'a', to: 'b' },
    { from: 'b', to: 'a' },
  ]),
  true,
);

const v = validateTaskDependencyRows([
  { taskId: 'b', dependsOnTaskId: 'a' },
  { taskId: 'c', dependsOnTaskId: 'b' },
]);
assert.equal(v.ok, true);

console.log('@foundry/task-core dag tests ok');
