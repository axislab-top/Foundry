#!/usr/bin/env node
/**
 * 验证：部门群「任务阶段系统通知」不会再次触发 Director LLM 管线（反馈环修复）。
 *
 * 流程：bootstrap 用户 → 公司向导 → 创建一条带 goalTargetRoomId 的子目标任务
 *      → 等待系统通知落库 → 检查部门群是否在短时间出现大量 Director 回复。
 */
import { createHash, randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { getJson, postJson, randStr, unwrap } from './lib/e2e-http.mjs';

const GATEWAY = (process.env.E2E_GATEWAY || 'http://127.0.0.1:3002').replace(/\/$/, '');
const WAIT_MS = Number(process.env.VERIFY_WAIT_MS || 45_000);

async function bootstrapUser() {
  const stamp = Date.now();
  const email = `e2e-dept-fix-${stamp}@example.com`;
  const password = `E2eDeptFix-${stamp}!9`;
  const username = `e2e_dept_fix_${stamp}`;
  const code = '123456';
  const codeHash = createHash('sha256').update(code).digest('hex');
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const sql = `INSERT INTO email_verification_codes (id, email, purpose, "codeHash", "expiresAt") VALUES ('${randomUUID()}', '${email}', 'register', '${codeHash}', '${expires}');`;
  execSync(`docker exec -i service-postgres-dev psql -U postgres -d service_db`, { input: sql, stdio: ['pipe', 'pipe', 'inherit'] });
  const reg = unwrap(
    await postJson(`${GATEWAY}/api/auth/register`, { username, email, password, verificationCode: code }),
  );
  if (!reg?.accessToken) throw new Error('register failed');
  return { email, password, accessToken: reg.accessToken };
}

async function completeCompanyWizard(authHeaders) {
  const draft = unwrap(await postJson(`${GATEWAY}/api/v1/companies/draft`, {}, authHeaders));
  const companyId = draft?.id;
  if (!companyId) throw new Error('draft company missing');

  const stamp = Date.now();
  const tenantHeaders = { ...authHeaders, 'x-company-id': companyId };
  const done = unwrap(
    await postJson(
      `${GATEWAY}/api/v1/companies/${companyId}/complete`,
      {
        name: `E2E部门环修复-${stamp}`,
        industry: '科技',
        industryCode: 'tech',
        scale: 'small',
        goal: 'verify dept loop fix',
      },
      tenantHeaders,
    ),
  );
  if (String(done?.status ?? '') !== 'active') throw new Error(`company not active: ${JSON.stringify(done).slice(0, 200)}`);
  return { companyId, companyName: done?.name ?? `E2E部门环修复-${stamp}` };
}

async function listRooms(authHeaders) {
  const raw = unwrap(await getJson(`${GATEWAY}/api/v1/collaboration/rooms?page=1&pageSize=50`, authHeaders));
  return Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
}

async function listMessages(authHeaders, roomId, limit = 80) {
  const raw = unwrap(
    await getJson(`${GATEWAY}/api/v1/collaboration/rooms/${roomId}/messages?limit=${limit}`, authHeaders),
  );
  return Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
}

async function findDirectorAndDeptRoom(authHeaders) {
  const agentsRaw = unwrap(await getJson(`${GATEWAY}/api/v1/agents?page=1&pageSize=50`, authHeaders));
  const agents = Array.isArray(agentsRaw?.items) ? agentsRaw.items : [];
  const director = agents.find((a) => String(a?.role ?? '').toLowerCase() === 'director');
  if (!director?.id) throw new Error('no director agent');

  const rooms = await listRooms(authHeaders);
  const deptRoom =
    rooms.find((r) => String(r?.roomType ?? '').toLowerCase() === 'department' && String(r.name ?? '').includes('工程')) ??
    rooms.find((r) => String(r?.roomType ?? '').toLowerCase() === 'department');
  if (!deptRoom?.id) throw new Error('no department room');
  return { directorId: director.id, deptRoomId: deptRoom.id, deptRoomName: deptRoom.name };
}

async function createSubGoalTask(authHeaders, { directorId, deptRoomId, companyId }) {
  const body = {
    title: `E2E验证子目标-${randStr(4)}`,
    description: '部门群系统通知不应触发 Director 自主回复环',
    assigneeType: 'agent',
    assigneeId: directorId,
    status: 'in_progress',
    priority: 'normal',
    metadata: {
      goalLevel: 'sub',
      goalTargetRoomId: deptRoomId,
      executionProfile: 'director_delegates',
    },
  };
  const task = unwrap(await postJson(`${GATEWAY}/api/v1/tasks`, body, authHeaders));
  return task;
}

function countBySender(messages) {
  const out = { system: 0, agent: 0, human: 0, other: 0 };
  for (const m of messages) {
    if (m.messageType === 'system' || String(m.content ?? '').includes('【部门任务已创建】')) out.system += 1;
    else if (m.senderType === 'agent') out.agent += 1;
    else if (m.senderType === 'human') out.human += 1;
    else out.other += 1;
  }
  return out;
}

async function main() {
  console.log('=== 部门任务阶段通知 · 反馈环修复验证 ===');
  console.log(`Gateway: ${GATEWAY}`);

  const { accessToken } = await bootstrapUser();
  const authHeaders = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  const { companyId, companyName } = await completeCompanyWizard(authHeaders);
  console.log(`公司就绪: ${companyName} (${companyId})`);
  authHeaders['x-company-id'] = companyId;

  const bootstrapDeadline = Date.now() + 90_000;
  let directorId;
  let deptRoomId;
  let deptRoomName;
  while (Date.now() < bootstrapDeadline) {
    try {
      ({ directorId, deptRoomId, deptRoomName } = await findDirectorAndDeptRoom(authHeaders));
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!deptRoomId) throw new Error('department room bootstrap timeout');
  console.log(`部门群: ${deptRoomName} (${deptRoomId}), Director: ${directorId}`);

  const before = await listMessages(authHeaders, deptRoomId);
  const beforeCounts = countBySender(before);

  const task = await createSubGoalTask(authHeaders, { directorId, deptRoomId, companyId });
  console.log(`已创建子目标任务: ${task?.id ?? task?.taskId ?? 'unknown'}`);

  const deadline = Date.now() + WAIT_MS;
  let after = before;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    after = await listMessages(authHeaders, deptRoomId);
    const hasStageNotice = after.some(
      (m) =>
        String(m.content ?? '').includes('【部门任务已创建】') ||
        String(m.metadata?.source ?? '') === 'department_task_stage_message',
    );
    if (hasStageNotice) break;
  }

  const afterCounts = countBySender(after);
  const newAgentReplies = after
    .filter((m) => m.senderType === 'agent' && !before.some((b) => b.id === m.id))
    .map((m) => ({ id: m.id, preview: String(m.content ?? '').slice(0, 120) }));

  const stageNotices = after.filter(
    (m) =>
      String(m.content ?? '').includes('【部门任务已创建】') ||
      String(m.metadata?.source ?? '') === 'department_task_stage_message',
  );

  console.log('\n--- 结果 ---');
  console.log('消息计数 before:', beforeCounts);
  console.log('消息计数 after:', afterCounts);
  console.log('阶段系统通知条数:', stageNotices.length);
  console.log('新增 Agent 回复数:', newAgentReplies.length);
  if (newAgentReplies.length) {
    console.log('新增 Agent 回复预览:', newAgentReplies.slice(0, 3));
  }

  const ok = stageNotices.length >= 1 && newAgentReplies.length === 0;
  if (!ok) {
    console.error('\nFAIL: 系统通知已出现，但 Director 仍自动回复（反馈环未修复或 Worker 未加载新代码）');
    process.exit(1);
  }
  console.log('\nPASS: 部门任务阶段系统通知已落库，且未触发 Director 自动 LLM 回复环。');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
