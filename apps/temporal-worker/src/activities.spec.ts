/**
 * Temporal activities：对内部 API 的 fetch 进行烟测（不启动服务）。
 */
import assert from 'node:assert';
import { supervisorRunPipeline, invokeSupervisorPublishReport } from './activities.js';

const originalFetch = globalThis.fetch;

async function run() {
  const calls: { url: string; method: string }[] = [];
  globalThis.fetch = (async (url: RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    return {
      ok: true,
      status: 200,
      json: async () => ({ lessonsIngestedToMemory: 1 }),
      text: async () => '',
    } as Response;
  }) as typeof fetch;

  process.env.API_INTERNAL_AUTH_SECRET = 'test-secret';
  process.env.API_INTERNAL_BASE_URL = 'http://127.0.0.1:3000';

  try {
    await supervisorRunPipeline({
      companyId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      runId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      taskId: 'cccccccc-dddd-eeee-ffff-000000000001',
      temporalWorkflowId: 'wf-1',
    });
    assert.ok(calls.some((c) => c.url.includes('/api/internal/supervisor/run-pipeline')));
    assert.ok(calls.some((c) => c.method === 'POST'));

    calls.length = 0;
    await invokeSupervisorPublishReport({
      companyId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      kind: 'daily',
    });
    assert.ok(calls.some((c) => c.url.includes('/api/internal/supervisor/publish-report')));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.API_INTERNAL_AUTH_SECRET;
  }

  console.log('temporal-worker activities.spec ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
