import assert from 'node:assert';
import {
  computeFailureSignatureHash,
  normalizeForFailureSignature,
} from './hash.js';
import { parseSupervisorLlmJson } from './lesson.js';

assert.ok(
  normalizeForFailureSignature('Error  abc').includes('error'),
  'lowercase normalize',
);

const h1 = computeFailureSignatureHash({
  errorSummary: 'timeout',
  taskTitle: 'T',
});
const h2 = computeFailureSignatureHash({
  errorSummary: 'timeout',
  taskTitle: 'T',
});
assert.strictEqual(h1, h2, 'stable hash');

const env = parseSupervisorLlmJson(
  JSON.stringify({
    lessons: [
      {
        rootCause: 'r',
        lesson: 'l',
        preventiveAction: 'p',
        confidence: 0.9,
      },
    ],
  }),
);
assert.strictEqual(env.lessons.length, 1);

console.log('supervisor-core lesson.spec ok');
