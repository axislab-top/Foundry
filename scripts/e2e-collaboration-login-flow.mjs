#!/usr/bin/env node
/**
 * 端到端：登录 → 拉公司列表 → 拉协作房间 → 发 @CEO 消息（与前端协作中心同源 HTTP 路径）。
 *
 * 凭据请用环境变量传入（勿提交到 git）：
 *   CMD:  set E2E_EMAIL=... & set E2E_PASSWORD=... & node scripts\e2e-collaboration-login-flow.mjs
 *   PowerShell:
 *     $env:E2E_EMAIL='...'; $env:E2E_PASSWORD='...'; node scripts/e2e-collaboration-login-flow.mjs
 *
 * 可选：E2E_GATEWAY=http://127.0.0.1:3002  E2E_POLL_SEC=120
 *        E2E_COMPANY_NAME=极光   按名称子串选公司（多公司账号时）
 *        E2E_STRICT_SYSTEM=1    必须出现 system 或 agent+text 才判成功（默认 0：含 agent 的 stream_chunk 即算成功）
 */

const GATEWAY = (process.env.E2E_GATEWAY || 'http://127.0.0.1:3002').replace(/\/$/, '');
const EMAIL = process.env.E2E_EMAIL?.trim();
const PASSWORD = process.env.E2E_PASSWORD;
const POLL_SEC = Math.min(300, Math.max(0, Number.parseInt(String(process.env.E2E_POLL_SEC || '90'), 10) || 90));
const COMPANY_NAME_HINT = process.env.E2E_COMPANY_NAME?.trim();
const STRICT_SYSTEM = String(process.env.E2E_STRICT_SYSTEM || '').trim() === '1';

function unwrap(data) {
  if (data && typeof data === 'object' && data.success === true && 'data' in data) {
    return data.data;
  }
  return data;
}

async function timed(label, fn) {
  const t0 = performance.now();
  try {
    const v = await fn();
    const ms = performance.now() - t0;
    console.log(`[${ms.toFixed(0)} ms] ${label}`);
    return v;
  } catch (e) {
    const ms = performance.now() - t0;
    console.log(`[${ms.toFixed(0)} ms] ${label} — FAILED`);
    throw e;
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('请设置 E2E_EMAIL 与 E2E_PASSWORD');
    process.exit(1);
  }

  console.log(`Gateway: ${GATEWAY}`);
  console.log(`User:    ${EMAIL}`);
  console.log('');

  const loginRes = await timed('POST /api/auth/login', async () => {
    const r = await fetch(`${GATEWAY}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      throw new Error(`Login non-JSON: ${r.status} ${text.slice(0, 400)}`);
    }
    if (!r.ok) {
      throw new Error(`Login ${r.status}: ${text.slice(0, 600)}`);
    }
    return j;
  });

  const auth = unwrap(loginRes);
  const accessToken = auth?.accessToken;
  if (!accessToken) {
    console.error('响应中无 accessToken:', JSON.stringify(loginRes).slice(0, 500));
    process.exit(1);
  }

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const companiesPayload = await timed('GET /api/v1/companies', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/companies?page=1&pageSize=20`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });

  const companiesData = unwrap(companiesPayload);
  const items = companiesData?.items ?? (Array.isArray(companiesData) ? companiesData : []);
  let pick = items[0];
  if (COMPANY_NAME_HINT && items.length) {
    const byName = items.find(
      (c) => typeof c?.name === 'string' && c.name.includes(COMPANY_NAME_HINT),
    );
    if (byName) {
      pick = byName;
      console.log(`  → 按 E2E_COMPANY_NAME 匹配: "${COMPANY_NAME_HINT}"`);
    } else {
      console.warn(`  → 未匹配 E2E_COMPANY_NAME="${COMPANY_NAME_HINT}"，使用列表第一项`);
    }
  }
  const companyId = pick?.id;
  if (!companyId) {
    console.error('未找到公司：请先创建公司或检查账号成员关系。原始:', JSON.stringify(companiesData).slice(0, 800));
    process.exit(1);
  }
  console.log(`  → companyId: ${companyId} (${pick?.name || '?'})`);

  const tenantHeaders = { ...authHeaders, 'x-company-id': companyId };

  const roomsPayload = await timed('GET /api/v1/collaboration/rooms', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/rooms`, { headers: tenantHeaders });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });

  const rooms = unwrap(roomsPayload);
  const roomList = Array.isArray(rooms) ? rooms : [];
  const mainRoom = roomList.find((x) => x.roomType === 'main') || roomList[0];
  const roomId = mainRoom?.id;
  if (!roomId) {
    console.error('无协作房间:', JSON.stringify(rooms).slice(0, 600));
    process.exit(1);
  }
  console.log(`  → roomId: ${roomId} (${mainRoom?.name || '?'})`);

  const membersPayload = await timed('GET room members (agents check)', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/rooms/${roomId}/members`, {
      headers: tenantHeaders,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });
  const membersData = unwrap(membersPayload);
  const memberList = Array.isArray(membersData) ? membersData : [];
  const agentCount = memberList.filter((m) => m.memberType === 'agent').length;
  console.log(`  → room members: ${memberList.length} total, ${agentCount} agent(s)`);

  const before = await timed('GET messages (before send)', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/rooms/${roomId}/messages?limit=30`, {
      headers: tenantHeaders,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });
  const beforeData = unwrap(before);
  const beforeItems = Array.isArray(beforeData?.items) ? beforeData.items : Array.isArray(beforeData) ? beforeData : [];
  const beforeCount = beforeItems.length;
  const beforeIds = new Set(beforeItems.map((m) => m.id).filter(Boolean));
  console.log(`  → messages before: ${beforeCount}`);

  const content = `@CEO E2E ${new Date().toISOString()} 自动化探活`;
  await timed('POST /api/v1/collaboration/messages', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/messages`, {
      method: 'POST',
      headers: tenantHeaders,
      body: JSON.stringify({ roomId, content, messageType: 'text' }),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });
  console.log(`  → sent: "${content.slice(0, 60)}..."`);

  if (POLL_SEC <= 0) {
    console.log('\n完成（未轮询 CEO 回复，E2E_POLL_SEC=0）。');
    return;
  }

  console.log(`\n轮询 ${POLL_SEC}s 内是否出现 agent / system 新消息（依赖 Worker + LLM）…`);
  const deadline = Date.now() + POLL_SEC * 1000;
  let seenAgent = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/rooms/${roomId}/messages?limit=50`, {
      headers: tenantHeaders,
    });
    const text = await r.text();
    if (!r.ok) {
      console.warn('poll messages failed', r.status, text.slice(0, 200));
      continue;
    }
    const j = unwrap(JSON.parse(text));
    const list = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
    const newOnes = list.filter((m) => {
      if (!m.id || beforeIds.has(m.id)) return false;
      if (m.messageType === 'system') return true;
      if (m.senderType !== 'agent') return false;
      if (STRICT_SYSTEM) {
        return m.messageType === 'text' || m.messageType === 'system';
      }
      return true;
    });
    if (newOnes.length) {
      const latest = newOnes[newOnes.length - 1];
      const preview = String(latest.content ?? '').replace(/\s+/g, ' ').slice(0, 120);
      console.log(
        `  → 发现 CEO 侧新消息: type=${latest.messageType} senderType=${latest.senderType} id=${latest.id}`,
      );
      if (preview) console.log(`     内容预览: ${preview}${preview.length >= 120 ? '…' : ''}`);
      seenAgent = true;
      break;
    }
    process.stdout.write('.');
  }
  console.log('');
  if (!seenAgent) {
    console.error(
      '超时内未在 HTTP 列表里看到符合条件的 CEO 回复（E2E_STRICT_SYSTEM=' +
        (STRICT_SYSTEM ? '1' : '0') +
        '）。可尝试加大 E2E_POLL_SEC 或查 Worker / LLM 日志。',
    );
    process.exit(1);
  }
  console.log('已在消息列表中看到 CEO/agent 回复（HTTP 轮询）。');
  console.log('\n=== E2E 通过 ===');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
