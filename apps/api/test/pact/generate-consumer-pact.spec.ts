/**
 * 生成 Consumer 契约文件到 contracts/pact/pacts/（提交到 Git）。
 * 每个 interaction 单独 finalize + merge，避免单实例连续 addInteraction 触发 pact-core 状态错误。
 * 更新：PACT_GENERATE=1 pnpm --filter @service/api run pact:generate
 */
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Pact, Matchers } from '@pact-foundation/pact';
import {
  PACT_ACTOR_ID,
  PACT_COMPANY_ID,
  PACT_RUN_ID,
  PACT_TASK_ID,
} from './pact-rpc-harness.js';

const { uuid, like, eachLike } = Matchers;

function resolvePactDir(): string {
  if (existsSync(path.resolve(process.cwd(), 'contracts/pact'))) {
    return path.resolve(process.cwd(), 'contracts/pact/pacts');
  }
  return path.resolve(process.cwd(), '../../contracts/pact/pacts');
}

const runGenerate = process.env.PACT_GENERATE === '1';
const d = runGenerate ? describe : describe.skip;

d('Pact consumer contract generation', () => {
  const pactDir = resolvePactDir();
  const common = {
    consumer: 'foundry-worker',
    provider: 'foundry-api',
    dir: pactDir,
    logLevel: 'error' as const,
    cors: true,
    pactfileWriteMode: 'merge' as const,
  };

  beforeAll(() => {
    mkdirSync(pactDir, { recursive: true });
  });

  it('merge interaction: tasks.run.start', async () => {
    const pact = new Pact(common);
    const opts = await pact.setup();
    await pact.addInteraction({
      state: 'tenant and admin for pact',
      uponReceiving: 'RPC tasks.run.start (HTTP shim)',
      withRequest: {
        method: 'POST',
        path: '/__pact/rpc/tasks.run.start',
        headers: { 'Content-Type': 'application/json' },
        body: {
          companyId: uuid(PACT_COMPANY_ID),
          actor: { id: uuid(PACT_ACTOR_ID), roles: eachLike('admin') },
          triggerSource: 'manual',
        },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: uuid(PACT_RUN_ID),
          companyId: uuid(PACT_COMPANY_ID),
          triggerSource: like('manual'),
          temporalWorkflowId: null,
          temporalRunId: null,
          status: like('running'),
          startedAt: like('2026-01-01T00:00:00.000Z'),
          finishedAt: null,
          errorSummary: null,
          costEstimate: null,
          metadata: null,
        },
      },
    });

    const port = opts.port;
    const base = `http://127.0.0.1:${port}`;
    const r1 = await fetch(`${base}/__pact/rpc/tasks.run.start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: PACT_COMPANY_ID,
        actor: { id: PACT_ACTOR_ID, roles: ['admin'] },
        triggerSource: 'manual',
      }),
    });
    if (!r1.ok) {
      throw new Error(`run.start failed ${r1.status}: ${await r1.text()}`);
    }
    await pact.verify();
    await pact.finalize();
  }, 120_000);

  it('merge interaction: tasks.executionLog.append', async () => {
    const pact = new Pact(common);
    const opts = await pact.setup();
    await pact.addInteraction({
      state: 'tenant and admin for pact',
      uponReceiving: 'RPC tasks.executionLog.append (HTTP shim)',
      withRequest: {
        method: 'POST',
        path: '/__pact/rpc/tasks.executionLog.append',
        headers: { 'Content-Type': 'application/json' },
        body: {
          companyId: uuid(PACT_COMPANY_ID),
          actor: { id: uuid(PACT_ACTOR_ID), roles: eachLike('admin') },
          id: uuid(PACT_TASK_ID),
          data: {
            stepType: 'heartbeat',
            message: like('pact'),
            runId: uuid(PACT_RUN_ID),
          },
        },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: like('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
          taskId: uuid(PACT_TASK_ID),
          stepType: like('heartbeat'),
          createdAt: like('2026-01-01T00:00:00.000Z'),
        },
      },
    });

    const port = opts.port;
    const base = `http://127.0.0.1:${port}`;
    const r2 = await fetch(`${base}/__pact/rpc/tasks.executionLog.append`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: PACT_COMPANY_ID,
        actor: { id: PACT_ACTOR_ID, roles: ['admin'] },
        id: PACT_TASK_ID,
        data: {
          stepType: 'heartbeat',
          message: 'pact',
          runId: PACT_RUN_ID,
        },
      }),
    });
    if (!r2.ok) {
      throw new Error(`append failed ${r2.status}: ${await r2.text()}`);
    }
    await pact.verify();
    await pact.finalize();
  }, 120_000);
});
