import assert from 'node:assert';
import {
  pickMemoryWriteTargets,
  resolveSupervisorLessonNamespaces,
  SUPERVISOR_LESSON_NAMESPACE,
  lessonAgentNamespace,
  lessonDepartmentNamespace,
} from './namespaces.js';

assert.deepStrictEqual(resolveSupervisorLessonNamespaces({}), [SUPERVISOR_LESSON_NAMESPACE]);

const nsAgent = resolveSupervisorLessonNamespaces({
  assigneeType: 'agent',
  assigneeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  agentOrganizationNodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
});
assert.ok(nsAgent.includes(SUPERVISOR_LESSON_NAMESPACE));
assert.ok(nsAgent.includes(lessonAgentNamespace('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')));
assert.ok(nsAgent.includes(lessonDepartmentNamespace('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')));

const writes = pickMemoryWriteTargets(nsAgent);
assert.strictEqual(writes.length, 2);
assert.strictEqual(writes[0], SUPERVISOR_LESSON_NAMESPACE);
assert.ok(writes[1].startsWith('lesson:agent:'));

const deptOnly = pickMemoryWriteTargets([
  SUPERVISOR_LESSON_NAMESPACE,
  lessonDepartmentNamespace('cccccccc-cccc-cccc-cccc-cccccccccccc'),
]);
assert.strictEqual(deptOnly[1].startsWith('lesson:dept:'), true);

console.log('supervisor-core namespaces.spec ok');
