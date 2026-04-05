import assert from 'node:assert/strict';
import { redactHeaders, redactUrlCredentials } from './redact.js';

{
  const u = redactUrlCredentials('https://user:secret@example.com/path?api_key=abc');
  assert.ok(!u.includes('secret'));
  assert.ok(!u.includes('abc'));
}

{
  const h = redactHeaders({ Authorization: 'Bearer x', 'X-Custom': 'ok' });
  assert.equal(h.Authorization, '[REDACTED]');
  assert.equal(h['X-Custom'], 'ok');
}

console.log('redact.spec: ok');
