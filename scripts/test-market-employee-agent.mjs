/**
 * E2E smoke test: marketplace employee「市场数据分析师」install + runtime checks.
 * Usage: node scripts/test-market-employee-agent.mjs
 */
const BASE = process.env.GATEWAY_URL || 'http://localhost:3002';
const MARKETPLACE_AGENT_ID =
  process.env.MARKETPLACE_AGENT_ID || '68d03197-ad39-46f6-b517-30352eab684e';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'okx@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'right123';

async function api(path, { method = 'GET', token, companyId, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (companyId) headers['X-Company-Id'] = companyId;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || json?.data?.message || JSON.stringify(json);
    throw new Error(`${method} ${path} -> ${res.status}: ${msg}`);
  }
  return json?.data ?? json;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Gateway: GET /api/v1/organizations/tree（需 X-Company-Id），返回根节点数组 */
function flattenOrgTree(roots) {
  const out = [];
  const walk = (n) => {
    out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  for (const r of roots ?? []) walk(r);
  return out;
}

async function resolveOrganizationNodeId(token, companyId) {
  const tree = await api('/api/v1/organizations/tree', { token, companyId });
  const roots = Array.isArray(tree) ? tree : [];
  const flat = flattenOrgTree(roots);

  const emptyAgentSlot = flat.find((n) => n.type === 'agent' && !n.agentId);
  if (emptyAgentSlot) return { id: emptyAgentSlot.id, source: 'existing_agent_slot' };

  const department = flat.find((n) => n.type === 'department');
  if (department) {
    const created = await api('/api/v1/organizations/nodes', {
      method: 'POST',
      token,
      companyId,
      body: {
        type: 'agent',
        name: `商城测试槽位-${Date.now().toString(36).slice(-6)}`,
        parentId: department.id,
      },
    });
    return { id: created.id, source: 'created_agent_slot', parentId: department.id };
  }

  const anyAgent = flat.find((n) => n.type === 'agent');
  if (anyAgent) return { id: anyAgent.id, source: 'existing_agent_node' };

  throw new Error('公司组织树中无 department/agent 节点，无法为商城安装指定组织槽位');
}

async function main() {
  const report = { steps: [], ok: false };

  console.log('=== 1. Admin login ===');
  const login = await api('/api/auth/admin/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const token = login.accessToken;
  report.steps.push({ step: 'login', ok: !!token });

  console.log('=== 2. List companies ===');
  const companiesRes = await api('/api/v1/companies?page=1&pageSize=10', { token });
  const companies = companiesRes?.items ?? companiesRes ?? [];
  const company = Array.isArray(companies)
    ? companies.find((c) => c.status === 'active') || companies[0]
    : null;
  if (!company?.id) throw new Error('No company found for test');
  const companyId = company.id;
  console.log(`Using company: ${company.name} (${companyId})`);
  report.steps.push({ step: 'company', companyId, name: company.name });

  console.log('=== 3. Organization tree (find or create agent slot) ===');
  const orgSlot = await resolveOrganizationNodeId(token, companyId);
  const orgNodeId = orgSlot.id;
  console.log(`Org node for install: ${orgNodeId} (${orgSlot.source})`);
  report.steps.push({ step: 'org_tree', orgNodeId, ...orgSlot });

  console.log('=== 4. Purchase / install marketplace agent ===');
  const purchaseQs = new URLSearchParams({ companyId, organizationNodeId: orgNodeId });
  let purchase;
  try {
    purchase = await api(
      `/api/v1/marketplace/agents/${MARKETPLACE_AGENT_ID}/purchase?${purchaseQs}`,
      { method: 'POST', token, companyId },
    );
    report.steps.push({ step: 'purchase', ok: true, purchase });
  } catch (e) {
    if (/already|exists|已安装|duplicate/i.test(e.message)) {
      console.warn('Purchase skipped (may already installed):', e.message);
      report.steps.push({ step: 'purchase', skipped: e.message });
    } else {
      throw e;
    }
  }

  console.log('=== 5. Wait for materialization ===');
  let companyAgent;
  for (let i = 0; i < 12; i++) {
    await sleep(1500);
    const agentsRes = await api('/api/v1/agents?page=1&pageSize=100', { token, companyId });
    const items = agentsRes?.items ?? [];
    companyAgent = items.find(
      (a) =>
        a.metadata?.marketplaceAgentId === MARKETPLACE_AGENT_ID ||
        String(a.metadata?.marketplaceAgentId) === MARKETPLACE_AGENT_ID,
    );
    if (companyAgent?.id) break;
    console.log(`  poll ${i + 1}/12: not materialized yet...`);
  }
  if (!companyAgent?.id) {
    throw new Error('Company agent not materialized after purchase (check worker + agent.purchased listener)');
  }
  console.log(`Company agent: ${companyAgent.name} (${companyAgent.id})`);
  console.log(`  llmModel=${companyAgent.llmModel} llmKeyId=${companyAgent.llmKeyId}`);
  report.steps.push({
    step: 'materialized',
    agentId: companyAgent.id,
    llmModel: companyAgent.llmModel,
    llmKeyId: companyAgent.llmKeyId,
  });

  console.log('=== 6. Marketplace LLM sync ===');
  const synced = await api(`/api/v1/agents/${companyAgent.id}/marketplace-llm-sync`, {
    method: 'POST',
    token,
    companyId,
  });
  report.steps.push({
    step: 'marketplace_llm_sync',
    llmModel: synced?.llmModel,
    llmKeyId: synced?.llmKeyId,
  });

  console.log('=== 7. Effective skills ===');
  const skills = await api(`/api/v1/agents/${companyAgent.id}/effective-skills`, {
    token,
    companyId,
  });
  const skillList = skills?.skills ?? skills ?? [];
  const skillNames = skillList.map((s) => s.name || s.skillName).filter(Boolean);
  console.log(`Skills bound: ${skillNames.length}`, skillNames);
  report.steps.push({ step: 'effective_skills', count: skillNames.length, names: skillNames });

  if (!companyAgent.llmModel) {
    throw new Error('Company agent has no llmModel after sync');
  }
  if (!companyAgent.llmKeyId && !synced?.llmKeyId) {
    console.warn('Warning: no llmKeyId on agent (pool-only mode may still work at runtime)');
  }

  console.log('=== 8. LLM key pool via API (agents.findOne + template bindings check) ===');
  const detail = await api(`/api/v1/agents/${companyAgent.id}`, { token, companyId });
  const mpId = detail.metadata?.marketplaceAgentId;
  const adminAgent = await api(`/api/admin/marketplace/agents/${MARKETPLACE_AGENT_ID}`, { token });
  const bindings = adminAgent.keyBindings ?? [];
  console.log(`Template key bindings: ${bindings.length}`);
  bindings.forEach((b, i) => {
    console.log(`  [${i}] ${b.modelName} key=${b.llmKeyId?.slice(0, 8)}...`);
  });
  report.steps.push({
    step: 'template_bindings',
    count: bindings.length,
    boundModelName: adminAgent.boundModelName,
  });

  const modelOk =
    detail.llmModel === adminAgent.boundModelName ||
    bindings.some((b) => b.modelName === detail.llmModel);
  if (!modelOk) {
    throw new Error(
      `llmModel mismatch: agent=${detail.llmModel} template=${adminAgent.boundModelName}`,
    );
  }

  console.log('\n=== RESULT: PASS ===');
  report.ok = true;
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error('\n=== RESULT: FAIL ===');
  console.error(e.message);
  process.exit(1);
});
