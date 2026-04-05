/**
 * 用户路径诊断：对比直连 API 与经 Gateway 的 companies 列表耗时，并打印 api-rpc-queue 深度。
 *
 * 用法（仓库根目录）：
 *   node scripts/diagnose-foundry-user-path.mjs
 *
 * 可选环境变量：
 *   API_URL=http://127.0.0.1:3000
 *   GATEWAY_URL=http://127.0.0.1:3002
 *   DIAGNOSTIC_JWT=eyJ...  （若已登录，跳过注册/登录，避免限流）
 *   RABBITMQ_CONTAINER=service-rabbitmq
 */

import { execSync } from 'child_process';

const API_URL = (process.env.API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const GATEWAY_URL = (process.env.GATEWAY_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');
const WEBHOOKS_URL = (process.env.WEBHOOKS_URL || 'http://127.0.0.1:3003').replace(/\/$/, '');
const WORKER_URL = (process.env.WORKER_URL || 'http://127.0.0.1:3004').replace(/\/$/, '');
const RABBIT_CONTAINER = process.env.RABBITMQ_CONTAINER || 'service-rabbitmq';

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

async function timedFetch(label, url, opts = {}) {
  const t0 = nowMs();
  let res;
  try {
    res = await fetch(url, {
      ...opts,
      headers: { Accept: 'application/json', ...opts.headers },
    });
  } catch (e) {
    return { label, ok: false, ms: nowMs() - t0, error: String(e?.message || e) };
  }
  const ms = nowMs() - t0;
  let bodyPreview = '';
  try {
    const text = await res.text();
    bodyPreview = text.slice(0, 200);
  } catch {
    bodyPreview = '(no body)';
  }
  return { label, ok: res.ok, ms, status: res.status, bodyPreview };
}

function rabbitApiRpcLine() {
  try {
    const out = execSync(
      `docker exec ${RABBIT_CONTAINER} rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers 2>&1`,
      { encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024, timeout: 20_000 },
    );
    const line = out.split(/\r?\n/).find((l) => l.includes('api-rpc-queue'));
    return line?.trim() || '(no api-rpc-queue line — container/name wrong?)';
  } catch (e) {
    return `(rabbitmqctl failed: ${e?.message || e})`;
  }
}

function extractAccessToken(json) {
  if (!json || typeof json !== 'object') return '';
  const d = json.data;
  if (d && typeof d === 'object' && typeof d.accessToken === 'string') return d.accessToken;
  if (typeof json.accessToken === 'string') return json.accessToken;
  return '';
}

async function obtainJwt() {
  const existing = process.env.DIAGNOSTIC_JWT?.trim();
  if (existing) return { token: existing, via: 'DIAGNOSTIC_JWT' };

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const register = {
    username: `diag${suffix}`,
    email: `diag${suffix}@example.test`,
    password: 'diag-pass-123',
  };

  const reg = await timedFetch(
    'gateway POST /api/auth/register',
    `${GATEWAY_URL}/api/auth/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(register),
    },
  );
  if (!reg.ok && reg.status !== 409) {
    console.error('Register failed:', reg);
    return { token: '', via: 'register failed', register: reg };
  }

  const t0 = nowMs();
  let loginRes;
  try {
    loginRes = await fetch(`${GATEWAY_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: register.email, password: register.password }),
    });
  } catch (e) {
    return { token: '', via: 'login fetch error', error: String(e?.message || e) };
  }
  const loginMs = nowMs() - t0;
  const loginText = await loginRes.text();
  let json;
  try {
    json = JSON.parse(loginText || '{}');
  } catch {
    json = null;
  }
  const token = extractAccessToken(json);
  if (!loginRes.ok || !token) {
    return {
      token: '',
      via: 'login failed',
      status: loginRes.status,
      loginMs,
      bodyPreview: loginText.slice(0, 400),
    };
  }
  return { token, via: 'register+login', loginMs };
}

async function main() {
  console.log('=== Foundry 用户路径诊断 ===\n');
  const qLine = rabbitApiRpcLine();
  console.log('RabbitMQ api-rpc-queue:', qLine);
  const m = qLine.match(/api-rpc-queue\s+(\d+)\s+(\d+)\s+(\d+)/);
  if (m) {
    const [, ready, unack, consumers] = m;
    if (Number(ready) > 50) {
      console.log(
        `\n⚠ 队列积压偏高: messages_ready=${ready}（约 ${ready} 条 RPC 尚在排队；单 consumer 时新请求会等前面的消息处理完）。`,
      );
    }
    console.log(`   (messages_ready / messages_unacked / consumers): ${ready} / ${unack} / ${consumers}`);
  }
  console.log('');

  const healthApi = await timedFetch('API GET /api/health', `${API_URL}/api/health`);
  const healthWh = await timedFetch('Webhooks GET /api/health', `${WEBHOOKS_URL}/api/health`);
  const healthWk = await timedFetch('Worker GET /api/health', `${WORKER_URL}/api/health`);
  const healthGw = await timedFetch('Gateway GET /api/health', `${GATEWAY_URL}/api/health`);
  console.log(
    'Health:',
    JSON.stringify({ api: healthApi, webhooks: healthWh, worker: healthWk, gateway: healthGw }, null, 2),
  );
  console.log(
    '\n说明：Gateway /api/health 会并行请求 API/Webhooks/Worker；任一在 HTTP_TIMEOUT 内失败会把整次健康检查拖到 ~30s 并显示 degraded。',
  );
  console.log('');

  const jwtResult = await obtainJwt();
  const { token, via } = jwtResult;
  if (!token) {
    console.error('无法获取 JWT。可设置 DIAGNOSTIC_JWT。Raw:', jwtResult);
    const directNoAuth = await timedFetch(
      'API GET /api/companies (无 JWT)',
      `${API_URL}/api/companies?page=1&pageSize=5`,
    );
    console.log('Direct API companies (无 JWT):', JSON.stringify(directNoAuth, null, 2));
    console.log('\n结论提示：');
    console.log('- 若 api-rpc-queue messages_ready 很大，超时主要来自排队而非业务代码。');
    process.exit(1);
  }

  const directAuth = await timedFetch(
    'API GET /api/companies（HTTP+DB，同一 JWT，不经 api-rpc-queue）',
    `${API_URL}/api/companies?page=1&pageSize=5`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  console.log('Direct API companies (JWT):', JSON.stringify(directAuth, null, 2));
  console.log('');

  const gw = await timedFetch(
    'Gateway GET /api/v1/companies（经 RMQ RPC companies.findAll）',
    `${GATEWAY_URL}/api/v1/companies?page=1&pageSize=5`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  console.log(`Gateway companies (JWT via ${via}):`, JSON.stringify(gw, null, 2));
  console.log('');

  console.log('=== 解读 ===');
  if (directAuth.ok && gw.ok && directAuth.ms + 2000 < gw.ms) {
    console.log(
      `- 直连 API 约 ${directAuth.ms}ms，经 Gateway RPC 约 ${gw.ms}ms：差额主要来自 RabbitMQ 排队/投递（请对照上方 api-rpc-queue 深度）。`,
    );
  }
  console.log(
    '- api-rpc-queue messages_ready 持续数百以上：单实例 API 消费跟不上 Worker/Gateway 入队速度，会持续 RPC 超时；应 purge/减负/多开 API 或削峰。',
  );
  console.log('- Webhooks/Worker 健康检查慢会导致 Gateway 聚合 health 变慢，但与 companies RPC 排队是两条线，可分别排查。');
  console.log('- 开发排障: docker exec <rabbit-container> rabbitmqctl purge_queue api-rpc-queue');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
