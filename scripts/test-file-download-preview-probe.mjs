#!/usr/bin/env node
/**
 * 探针：file-assets 下载 / 预览（经 Gateway 代理）
 */
import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { getJson, postJson, unwrap } from './lib/e2e-http.mjs';

const GATEWAY = (process.env.E2E_GATEWAY || 'http://127.0.0.1:3002').replace(/\/$/, '');
const API = (process.env.E2E_API || 'http://127.0.0.1:3000').replace(/\/$/, '');

function psql(sql) {
  return execSync('docker exec -i service-postgres-dev psql -U postgres -d service_db -t -A', {
    input: sql,
    encoding: 'utf8',
  }).trim();
}

async function insertVerificationCode(email) {
  const code = '123456';
  const codeHash = createHash('sha256').update(code).digest('hex');
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  psql(
    `INSERT INTO email_verification_codes (id, email, purpose, "codeHash", "expiresAt") VALUES ('${randomUUID()}', '${email}', 'register', '${codeHash}', '${expires}');`,
  );
  return code;
}

async function bootstrapCompany(authHeaders) {
  const stamp = Date.now();
  const draft = unwrap(await postJson(`${GATEWAY}/api/v1/companies/draft`, {}, authHeaders));
  const companyId = draft?.id;
  if (!companyId) throw new Error('draft missing id');
  const tenantHeaders = { ...authHeaders, 'x-company-id': companyId };
  const tpl = unwrap(
    await postJson(
      `${GATEWAY}/api/v1/companies/wizard/template-recommendations`,
      { industryCode: 'tech', scale: 'small', goal: 'download probe' },
      tenantHeaders,
    ),
  );
  const templates = Array.isArray(tpl?.templates) ? tpl.templates : [];
  await postJson(
    `${GATEWAY}/api/v1/companies/${companyId}/complete`,
    {
      name: `下载探针-${stamp}`,
      industry: '科技',
      industryCode: 'tech',
      scale: 'small',
      goal: 'file download probe',
      departmentPlacements: templates[0]?.departmentPlacements ?? [],
    },
    tenantHeaders,
  );
  return { companyId, tenantHeaders };
}

async function downloadRaw(url, headers, accept = '*/*') {
  const r = await fetch(url, { headers: { Accept: accept, ...headers } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, contentType: r.headers.get('content-type') ?? '', body: buf };
}

async function main() {
  const stamp = Date.now();
  const email = `dl-probe-${stamp}@example.com`;
  const password = `Probe-${stamp}!9`;
  const markdown = `# AI 交付物探针\n\n生成时间: ${new Date().toISOString()}\n\n## 结论\n- 竞品分析完成\n- 建议下周评审\n`;

  console.log('=== 1. 注册 & 登录 ===');
  const code = await insertVerificationCode(email);
  await postJson(`${GATEWAY}/api/auth/register`, {
    username: `dl_probe_${stamp}`,
    email,
    password,
    verificationCode: code,
  });
  const login = unwrap(await postJson(`${GATEWAY}/api/auth/login`, { email, password }));
  const token = login?.accessToken;
  if (!token) throw new Error('login failed');
  const authHeaders = { Authorization: `Bearer ${token}` };
  console.log('OK login');

  console.log('=== 2. 创建公司 & 上传 Markdown ===');
  const { companyId, tenantHeaders } = await bootstrapCompany(authHeaders);
  const form = new FormData();
  form.append('file', new Blob([markdown], { type: 'text/markdown' }), 'ai-deliverable-probe.md');
  const uploadRes = await fetch(`${GATEWAY}/api/v1/file-assets/upload?category=report`, {
    method: 'POST',
    headers: tenantHeaders,
    body: form,
  });
  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(`upload failed: ${JSON.stringify(uploadJson).slice(0, 400)}`);
  const fileId = unwrap(uploadJson)?.id;
  if (!fileId) throw new Error('upload missing id');
  console.log('OK upload', { fileId, companyId });

  console.log('=== 3. Gateway 下载（模拟浏览器 blob） ===');
  const dl = await downloadRaw(`${GATEWAY}/api/v1/file-assets/${fileId}/download`, tenantHeaders);
  console.log('download', { status: dl.status, contentType: dl.contentType, bytes: dl.body.length });
  const dlText = dl.body.toString('utf8');
  const dlOk = dl.status === 200 && dlText.includes('AI 交付物探针') && !dlText.startsWith('{');
  console.log(dlOk ? 'PASS download content' : 'FAIL download content', dlText.slice(0, 120));

  console.log('=== 4. Gateway 预览（responseType=text） ===');
  const preview = await downloadRaw(
    `${GATEWAY}/api/v1/file-assets/${fileId}/download`,
    tenantHeaders,
    'text/plain,*/*',
  );
  const previewText = preview.body.toString('utf8');
  const previewOk = preview.status === 200 && previewText.includes('竞品分析完成');
  console.log(previewOk ? 'PASS preview text' : 'FAIL preview text', previewText.slice(0, 120));

  console.log('=== 5. API 直连下载（对照组） ===');
  const apiDl = await downloadRaw(`${API}/api/file-assets/${fileId}/download`, tenantHeaders);
  const apiText = apiDl.body.toString('utf8');
  console.log(apiDl.status === 200 && apiText.includes('AI 交付物探针') ? 'PASS api direct' : 'FAIL api direct');

  console.log('=== 6. 历史 agent 产出抽检 ===');
  const rows = psql(`
SELECT fa.id, fa.name, fa.size, fa.company_id, c.name
FROM file_assets fa
JOIN companies c ON c.id = fa.company_id
WHERE fa.deleted_at IS NULL AND fa.source_type='agent' AND fa.content_type='text/markdown'
ORDER BY fa.created_at DESC LIMIT 3;
`);
  for (const line of rows.split('\n').filter(Boolean)) {
    const [id, name, size, cid, cname] = line.split('|');
    console.log(`  - ${name} (${size}B) company=${cname} id=${id.slice(0, 8)}…`);
  }

  const digestCount = psql(`
SELECT count(*) FROM chat_messages
WHERE metadata->'richCard'->>'cardType'='supervision_deliverable_digest'
  AND created_at > now() - interval '7 days';
`);
  const deliverableCount = psql(`
SELECT count(*) FROM chat_messages
WHERE metadata->'richCard'->>'cardType'='employee_deliverable'
  AND created_at > now() - interval '7 days';
`);
  console.log('=== 7. 近 7 天产出卡片 ===');
  console.log(`  employee_deliverable: ${deliverableCount}`);
  console.log(`  supervision_deliverable_digest: ${digestCount}`);

  if (!dlOk || !previewOk) process.exit(1);
  console.log('\nALL PASS');
}

main().catch((e) => {
  console.error('PROBE FAILED:', e.message);
  process.exit(1);
});
