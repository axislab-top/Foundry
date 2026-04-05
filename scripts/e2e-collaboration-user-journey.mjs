#!/usr/bin/env node
/**
 * 用户视角：协作中心完整探活（与 client-frontend 同源 Gateway HTTP）
 *
 * 流程概览（对应 CEO 流水线 + 只读协作阶段）：
 *  1) 登录
 *  2) 选公司、进主协作房，记录 collaborationMode（仅展示，不可手动改）
 *  3) 新建讨论线程
 *  4) 在线程里发「讨论」向消息（触发讨论路径 + 可能的 CEO 控场语）
 *  5) 轮询是否出现 Agent/CEO 新消息
 *  6) 再 GET 房间，观察 collaborationMode 是否被 Worker 回写
 *  7) 在主房发「开始执行」+ @CEO（触发执行拆解路径）
 *  8) 轮询是否出现新的 agent/system 消息
 *
 * 凭据（勿提交 git）：
 *   PowerShell:
 *     $env:E2E_EMAIL='...'; $env:E2E_PASSWORD='...'; node scripts/e2e-collaboration-user-journey.mjs
 *
 * 可选环境变量：
 *   E2E_GATEWAY=http://127.0.0.1:3002
 *   E2E_COMPANY_NAME=子串   多公司时按名称筛选
 *   E2E_POLL_SEC=120        每阶段轮询上限秒数
 *   E2E_STRICT_SYSTEM=1     与旧脚本一致：仅 text/system 算 CEO 回复
 *   E2E_SKIP_EXECUTION=1    跳过第 7–8 步（仅测讨论）
 */

const GATEWAY = (process.env.E2E_GATEWAY || 'http://127.0.0.1:3002').replace(/\/$/, '');
const EMAIL = process.env.E2E_EMAIL?.trim();
const PASSWORD = process.env.E2E_PASSWORD;
const POLL_SEC = Math.min(300, Math.max(10, Number.parseInt(String(process.env.E2E_POLL_SEC || '90'), 10) || 90));
const COMPANY_NAME_HINT = process.env.E2E_COMPANY_NAME?.trim();
const STRICT_SYSTEM = String(process.env.E2E_STRICT_SYSTEM || '').trim() === '1';
const SKIP_EXECUTION = String(process.env.E2E_SKIP_EXECUTION || '').trim() === '1';

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
    console.log(`[${(performance.now() - t0).toFixed(0)} ms] ${label}`);
    return v;
  } catch (e) {
    console.log(`[${(performance.now() - t0).toFixed(0)} ms] ${label} — FAILED`);
    throw e;
  }
}

function messageMatchesAgentReply(m, beforeIds, strict) {
  if (!m.id || beforeIds.has(m.id)) return false;
  if (m.messageType === 'system') return true;
  if (m.senderType !== 'agent') return false;
  if (strict) {
    return m.messageType === 'text' || m.messageType === 'system';
  }
  return true;
}

async function pollNewAgentMessages(tenantHeaders, roomId, beforeIds, label) {
  const deadline = Date.now() + POLL_SEC * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/rooms/${roomId}/messages?limit=60`, {
      headers: tenantHeaders,
    });
    const text = await r.text();
    if (!r.ok) {
      console.warn(`  poll ${label}: HTTP ${r.status}`, text.slice(0, 120));
      continue;
    }
    const j = unwrap(JSON.parse(text));
    const list = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
    const hits = list.filter((m) => messageMatchesAgentReply(m, beforeIds, STRICT_SYSTEM));
    if (hits.length) {
      const latest = hits[hits.length - 1];
      const preview = String(latest.content ?? '').replace(/\s+/g, ' ').slice(0, 160);
      console.log(`  ✓ ${label}: new ${latest.messageType} from ${latest.senderType} id=${latest.id}`);
      if (preview) console.log(`    预览: ${preview}${preview.length >= 160 ? '…' : ''}`);
      return true;
    }
    process.stdout.write('.');
  }
  console.log('');
  return false;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('请设置 E2E_EMAIL 与 E2E_PASSWORD 后重试。');
    process.exit(1);
  }

  console.log('=== 协作中心 · 用户旅程 E2E ===\n');
  console.log(`Gateway: ${GATEWAY}`);
  console.log(`User:    ${EMAIL}`);
  console.log(`Poll:    ${POLL_SEC}s / phase  strictSystem=${STRICT_SYSTEM}  skipExecution=${SKIP_EXECUTION}\n`);

  const loginRes = await timed('① POST /api/auth/login', async () => {
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
      throw new Error(`Login 非 JSON: ${r.status} ${text.slice(0, 400)}`);
    }
    if (!r.ok) {
      throw new Error(`Login ${r.status}: ${text.slice(0, 600)}`);
    }
    return j;
  });
  const auth = unwrap(loginRes);
  const accessToken = auth?.accessToken;
  if (!accessToken) {
    console.error('登录响应中无 accessToken（请检查邮箱密码或网关 /api/auth/login 包装格式）');
    console.error('原始片段:', JSON.stringify(loginRes).slice(0, 500));
    process.exit(1);
  }

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const companiesPayload = await timed('② GET /api/v1/companies', async () => {
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
    if (byName) pick = byName;
  }
  const companyId = pick?.id;
  if (!companyId) {
    console.error('无公司');
    process.exit(1);
  }
  console.log(`  → company: ${pick?.name} (${companyId})`);

  const tenantHeaders = { ...authHeaders, 'x-company-id': companyId };

  const roomsPayload = await timed('③ GET /api/v1/collaboration/rooms', async () => {
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
    console.error('无协作房间');
    process.exit(1);
  }
  console.log(`  → room: ${mainRoom?.name} (${roomId})  mode=${mainRoom?.collaborationMode ?? '?'}`);

  const roomDetail = await timed('④ GET room detail (只读协作阶段)', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/rooms/${roomId}`, { headers: tenantHeaders });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });
  const detail = unwrap(roomDetail);
  const modeBefore = detail?.collaborationMode ?? mainRoom?.collaborationMode;
  console.log(`  → collaborationMode (before): ${modeBefore ?? 'n/a'}`);

  const beforeMsgs = await timed('⑤ GET messages (baseline)', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/rooms/${roomId}/messages?limit=40`, {
      headers: tenantHeaders,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });
  const beforeData = unwrap(beforeMsgs);
  const beforeItems = Array.isArray(beforeData?.items) ? beforeData.items : [];
  const beforeIds = new Set(beforeItems.map((m) => m.id).filter(Boolean));
  console.log(`  → messages count: ${beforeItems.length}`);

  const threadTitle = `E2E旅程 ${new Date().toISOString().slice(0, 19)}`;
  const threadRes = await timed('⑥ POST 新建讨论线程', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/rooms/${roomId}/threads`, {
      method: 'POST',
      headers: tenantHeaders,
      body: JSON.stringify({ title: threadTitle }),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });
  const thread = unwrap(threadRes);
  const threadId = thread?.id;
  if (!threadId) {
    console.error('创建线程失败:', JSON.stringify(threadRes).slice(0, 400));
    process.exit(1);
  }
  console.log(`  → threadId: ${threadId}`);

  const discussContent = `@CEO 大家一起讨论一下下季度产品方向吧 E2E-${Date.now()}`;
  await timed('⑦ POST 线程内讨论消息', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/messages`, {
      method: 'POST',
      headers: tenantHeaders,
      body: JSON.stringify({
        roomId,
        threadId,
        content: discussContent,
        messageType: 'text',
      }),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });
  console.log(`  → sent: "${discussContent.slice(0, 70)}..."`);

  console.log(`\n⑧ 轮询讨论/CEO 侧回复（最长 ${POLL_SEC}s）…`);
  const seenDiscuss = await pollNewAgentMessages(tenantHeaders, roomId, beforeIds, '讨论阶段');
  if (!seenDiscuss) {
    console.error(
      '讨论阶段：超时未看到符合条件的 Agent/System 新消息。请检查 Worker、RabbitMQ、LLM 配置。',
    );
    process.exit(1);
  }

  const roomAfterDiscuss = await timed('⑨ GET room（协作阶段是否被 CEO 回写）', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/rooms/${roomId}`, { headers: tenantHeaders });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });
  const detail2 = unwrap(roomAfterDiscuss);
  console.log(
    `  → collaborationMode: ${modeBefore ?? 'n/a'} → ${detail2?.collaborationMode ?? 'n/a'}（仅展示）`,
  );

  if (SKIP_EXECUTION) {
    console.log('\n已 E2E_SKIP_EXECUTION=1，跳过执行阶段。\n=== 用户旅程 E2E 通过（讨论）===');
    return;
  }

  const beforeExec = await timed('⑩ GET messages（执行前再取 baseline ids）', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/rooms/${roomId}/messages?limit=80`, {
      headers: tenantHeaders,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });
  const execBeforeData = unwrap(beforeExec);
  const execBeforeItems = Array.isArray(execBeforeData?.items) ? execBeforeData.items : [];
  const execBeforeIds = new Set(execBeforeItems.map((m) => m.id).filter(Boolean));

  const execContent = `@CEO 开始执行 E2E 自动化验收计划 ${Date.now()}`;
  await timed('⑪ POST 主房执行向消息', async () => {
    const r = await fetch(`${GATEWAY}/api/v1/collaboration/messages`, {
      method: 'POST',
      headers: tenantHeaders,
      body: JSON.stringify({
        roomId,
        content: execContent,
        messageType: 'text',
      }),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  });
  console.log(`  → sent: "${execContent.slice(0, 70)}..."`);

  console.log(`\n⑫ 轮询执行/拆解后 CEO 侧输出（最长 ${POLL_SEC}s）…`);
  const seenExec = await pollNewAgentMessages(tenantHeaders, roomId, execBeforeIds, '执行阶段');
  if (!seenExec) {
    console.error(
      '执行阶段：超时未看到新 Agent/System 消息。若拆解仅走任务系统而无群聊回复，可改 E2E_STRICT_SYSTEM 或接受讨论阶段已通过。',
    );
    process.exit(1);
  }

  console.log('\n=== 用户旅程 E2E 通过（讨论 + 执行）===');
  console.log('\n浏览器侧可再手动验证：打开客户端「协作中心」→ 同一房间 → 只读协作阶段标签、线程与消息是否与上述一致。');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
