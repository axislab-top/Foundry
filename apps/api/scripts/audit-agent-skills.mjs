/**
 * Read-only audit: list all executor agents and compare bound vs expected skills.
 * Usage: node scripts/audit-agent-skills.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFromFile() {
  const tryPaths = [
    join(__dirname, '../../../.env'),
    join(__dirname, '../../../.env.local'),
    join(__dirname, '../../.env'),
  ];
  for (const p of tryPaths) {
    try {
      const raw = readFileSync(p, 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const k = m[1];
        let v = m[2].replace(/\r$/, '');
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (process.env[k] === undefined) process.env[k] = v;
      }
      break;
    } catch {
      // ignore
    }
  }
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.POSTGRES_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';
  const user = process.env.POSTGRES_USER || process.env.DB_USERNAME || 'postgres';
  const pass = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || 'postgres';
  const db = process.env.DB_DATABASE || process.env.POSTGRES_DB || 'service_db';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

const EXECUTOR_BACKFILL_DEFAULTS = [
  'echo',
  'code-run',
  'file-read',
  'file-write',
  'github-create-issue',
];

/** 与 contracts/types/marketplace-department-head.ts 一致 */
const DIRECTOR_CONTRACT_DEFAULTS = [
  'director-task-delegator',
  'director-progress-reporter',
  'director-subordinate-reviewer',
  'department.knowledge.query',
  'director-team-performance-coach',
];

const ROLE_DEFAULTS = {
  ceo: [
    'ceo-strategic-breakdown',
    'ceo-heartbeat-orchestrator',
    'ceo-task-assigner',
    'ceo-budget-guardian',
    'ceo-approval-initiator',
    'ceo-memory-strategist',
    'ceo-cross-department-coordinator',
    'ceo-performance-analyzer',
    'ceo-risk-assessor',
    'ceo-model-router-optimizer',
  ],
  director: DIRECTOR_CONTRACT_DEFAULTS,
  board_member: ['echo', 'web-search', 'heartbeat'],
  executor: ['heartbeat', 'employee-task-reporter'],
};

loadEnvFromFile();

const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
await client.connect();

try {
  const globalSkills = await client.query('select id, name from skills where company_id is null');
  const skillByName = new Map(globalSkills.rows.map((r) => [r.name, r.id]));

  const mp = await client.query(
    'select id, name, slug, agent_category, recommended_skills from marketplace_agents',
  );
  const mpById = new Map(mp.rows.map((r) => [r.id, r]));

  const agents = await client.query(`
    select a.id, a.name, a.role, a.status, a.company_id, c.name as company_name,
           a.metadata->>'marketplaceAgentId' as marketplace_agent_id,
           on2.name as org_node_name
    from agents a
    left join companies c on c.id = a.company_id
    left join organization_nodes on2 on on2.id = a.organization_node_id
    order by c.name nulls last, a.role, a.name
  `);

  const bindings = await client.query(`
    select ags.agent_id, s.name as skill_name
    from agent_skills ags
    join skills s on s.id = ags.skill_id
    order by ags.agent_id, s.name
  `);
  const boundByAgent = new Map();
  for (const r of bindings.rows) {
    if (!boundByAgent.has(r.agent_id)) boundByAgent.set(r.agent_id, []);
    boundByAgent.get(r.agent_id).push(r.skill_name);
  }

  function expectedForAgent(a) {
    const role = String(a.role || '');
    const defaults = ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.executor;
    let marketplace = [];
    let mpName = null;
    let mpSlug = null;
    if (a.marketplace_agent_id && mpById.has(a.marketplace_agent_id)) {
      const m = mpById.get(a.marketplace_agent_id);
      mpName = m.name;
      mpSlug = m.slug;
      marketplace = Array.isArray(m.recommended_skills)
        ? m.recommended_skills.map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
    }
    if (role === 'executor' && marketplace.length === 0) {
      return {
        expected: [...new Set([...defaults, ...EXECUTOR_BACKFILL_DEFAULTS])],
        mpName,
        mpSlug,
        source: 'role+executor-fallback',
      };
    }
    return {
      expected: [...new Set([...defaults, ...marketplace])],
      mpName,
      mpSlug,
      source: marketplace.length ? 'role+marketplace' : 'role-only',
    };
  }

  const roleCounts = {};
  for (const a of agents.rows) {
    roleCounts[a.role] = (roleCounts[a.role] ?? 0) + 1;
  }

  function isEmployeeAgent(a) {
    if (a.role === 'executor') return true;
    if (!a.marketplace_agent_id || !mpById.has(a.marketplace_agent_id)) return false;
    const m = mpById.get(a.marketplace_agent_id);
    if (String(m.agent_category ?? '').toLowerCase() === 'employee') return true;
    const slug = String(m.slug ?? '');
    return slug.startsWith('agency-') || slug.startsWith('employee-');
  }

  const targets = agents.rows.filter(isEmployeeAgent);

  const report = [];

  for (const a of targets) {
    const bound = boundByAgent.get(a.id) ?? [];
    const { expected, mpName, mpSlug, source } = expectedForAgent(a);
    const missingGlobal = expected.filter((n) => !skillByName.has(n));
    const missingBound = expected.filter((n) => skillByName.has(n) && !bound.includes(n));
    const extraBound = bound.filter((n) => !expected.includes(n));
    const ok = missingGlobal.length === 0 && missingBound.length === 0 && bound.length > 0;
    report.push({
      name: a.name,
      id: a.id,
      company: a.company_name,
      orgNode: a.org_node_name,
      status: a.status,
      marketplace: mpName || mpSlug || a.marketplace_agent_id || null,
      boundCount: bound.length,
      expectedCount: expected.length,
      bound,
      expected,
      missingGlobal,
      missingBound,
      extraBound,
      ok,
      source,
    });
  }

  const summary = {
    totalAgents: agents.rows.length,
    agentsByRole: roleCounts,
    totalEmployees: report.length,
    ok: report.filter((r) => r.ok).length,
    noSkillsAtAll: report.filter((r) => r.boundCount === 0).length,
    partialBind: report.filter((r) => r.boundCount > 0 && !r.ok).length,
    missingGlobalSkillsInDb: [...new Set(report.flatMap((r) => r.missingGlobal))].sort(),
    globalSkillCount: skillByName.size,
  };

  const allAgentsBrief = agents.rows.map((a) => ({
    name: a.name,
    role: a.role,
    company: a.company_name,
    boundCount: (boundByAgent.get(a.id) ?? []).length,
    marketplaceAgentId: a.marketplace_agent_id,
    isEmployee: isEmployeeAgent(a),
  }));

  const mpEmployees = mp.rows.filter((r) => String(r.agent_category ?? '').toLowerCase() === 'employee');
  const mpEmployeeAudit = mpEmployees.map((m) => {
    const rec = Array.isArray(m.recommended_skills)
      ? m.recommended_skills.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    const missingGlobal = rec.filter((n) => !skillByName.has(n));
    return {
      name: m.name,
      slug: m.slug,
      recommendedCount: rec.length,
      missingGlobal,
      ok: missingGlobal.length === 0 && rec.length > 0,
    };
  });

  const mpEmployeeOkList = mpEmployeeAudit.filter((x) => x.ok).map((x) => x.name);
  const mpEmployeeBrokenList = mpEmployeeAudit.filter((x) => !x.ok);

  const installedMpEmployeeIds = new Set(
    agents.rows
      .filter((a) => a.marketplace_agent_id && mpById.has(a.marketplace_agent_id))
      .filter((a) => String(mpById.get(a.marketplace_agent_id).agent_category ?? '').toLowerCase() === 'employee')
      .map((a) => a.marketplace_agent_id),
  );

  const directorReport = [];
  for (const a of agents.rows.filter((x) => x.role === 'director')) {
    const bound = boundByAgent.get(a.id) ?? [];
    const { expected, mpName, mpSlug } = expectedForAgent(a);
    const missingGlobal = expected.filter((n) => !skillByName.has(n));
    const missingBound = expected.filter((n) => skillByName.has(n) && !bound.includes(n));
    const ok = missingGlobal.length === 0 && missingBound.length === 0 && bound.length > 0;
    directorReport.push({
      name: a.name,
      company: a.company_name,
      boundCount: bound.length,
      expectedCount: expected.length,
      missingGlobal,
      missingBound,
      ok,
      marketplace: mpName || mpSlug,
    });
  }

  const directorByCompany = {};
  for (const d of directorReport) {
    const key = d.company || '(no company)';
    if (!directorByCompany[key]) {
      directorByCompany[key] = { total: 0, ok: 0, zeroSkills: 0, partial: 0 };
    }
    directorByCompany[key].total += 1;
    if (d.ok) directorByCompany[key].ok += 1;
    else if (d.boundCount === 0) directorByCompany[key].zeroSkills += 1;
    else directorByCompany[key].partial += 1;
  }

  console.log(
    JSON.stringify(
      {
        summary,
        report,
        marketplaceEmployees: {
          totalInCatalog: mpEmployees.length,
          installedToCompanies: installedMpEmployeeIds.size,
          notInstalledCount: mpEmployees.length - installedMpEmployeeIds.size,
          catalogOk: mpEmployeeOkList.length,
          catalogBroken: mpEmployeeBrokenList.length,
          okNames: mpEmployeeOkList,
          broken: mpEmployeeBrokenList,
        },
        directors: {
          total: directorReport.length,
          ok: directorReport.filter((x) => x.ok).length,
          zeroSkills: directorReport.filter((x) => x.boundCount === 0).length,
          partial: directorReport.filter((x) => x.boundCount > 0 && !x.ok).length,
          byCompany: directorByCompany,
          problemSamples: directorReport.filter((x) => !x.ok).slice(0, 20),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
