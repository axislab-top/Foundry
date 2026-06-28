/**
 * Audit director management + domain skill tool/MCP bindings.
 * Usage: pnpm -C apps/api run audit:director-skill-tool-bindings
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFromFile() {
  for (const p of [
    join(__dirname, '../../../.env'),
    join(__dirname, '../../../.env.local'),
    join(__dirname, '../.env'),
    join(__dirname, '../../.env'),
  ]) {
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = m[2].replace(/\r$/, '');
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
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

const MANAGEMENT_EXPECTED = {
  'director-task-delegator': ['organization_node_agents', 'task_create_and_assign', 'message_send_to_agent'],
  'director-progress-reporter': ['organization_node_agents', 'task_list_by_department'],
  'director-subordinate-reviewer': ['organization_node_agents', 'task_list_by_department', 'message_send_to_agent'],
  'director-team-performance-coach': ['organization_node_agents', 'task_list_by_department', 'message_send_to_agent'],
  'department.knowledge.query': ['ceo_department_knowledge_query'],
};

const DOMAIN_EXPECTED = {
  engineering: {
    'engineering-code-review-orchestrator': [
      'organization_node_agents',
      'task_list_by_department',
      'message_send_to_agent',
    ],
    'engineering-ci-cd-pipeline-manager': [
      'organization_node_agents',
      'task_list_by_department',
      'message_send_to_agent',
    ],
    'engineering-security-scanner': ['organization_node_agents', 'message_send_to_agent'],
    'engineering-ai-tool-integrator': [
      'organization_node_agents',
      'task_create_and_assign',
      'message_send_to_agent',
    ],
    'engineering-team-velocity-coach': [
      'organization_node_agents',
      'task_list_by_department',
      'message_send_to_agent',
    ],
    'engineering-tech-debt-assessor': [],
    'engineering-architecture-decision-recorder': [],
  },
  design: {
    'design-critique': ['organization_node_agents', 'task_list_by_department', 'message_send_to_agent'],
    'accessibility-pass': ['organization_node_agents', 'message_send_to_agent'],
    'visual-handoff-packager': [
      'organization_node_agents',
      'task_create_and_assign',
      'message_send_to_agent',
    ],
    'brand-consistency-checker': ['organization_node_agents', 'message_send_to_agent'],
    'design-system-auditor': [],
    'ux-flow-mapper': [],
  },
  'research-intelligence': {
    'research-market-intelligence-synthesizer': [
      'organization_node_agents',
      'task_list_by_department',
      'message_send_to_agent',
    ],
    'research-macro-policy-monitor': ['organization_node_agents', 'message_send_to_agent'],
    'research-thesis-red-team': ['organization_node_agents', 'message_send_to_agent'],
    'research-fundamental-analyst': [],
    'research-company-deep-dive': [],
    'research-investment-memo-writer': [],
  },
};

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const allSkillNames = [
      ...Object.keys(MANAGEMENT_EXPECTED),
      ...Object.values(DOMAIN_EXPECTED).flatMap((m) => Object.keys(m)),
    ];
    const skillsRes = await client.query(
      `select id, name, metadata->>'protocol' as protocol from skills where company_id is null and name = any($1::text[])`,
      [allSkillNames],
    );
    const skillIds = skillsRes.rows.map((r) => r.id);
    const skillByName = new Map(skillsRes.rows.map((r) => [r.name, r]));

    const toolBinds =
      skillIds.length > 0
        ? await client.query(
            `select s.name as skill_name, t.name as tool_name
             from skill_tool_bindings stb
             join skills s on s.id = stb.skill_id
             join tools t on t.id = stb.tool_id
             where stb.skill_id = any($1::uuid[])
             order by s.name, stb.position`,
            [skillIds],
          )
        : { rows: [] };

    const mcpBinds =
      skillIds.length > 0
        ? await client.query(
            `select s.name as skill_name, mt.name as mcp_tool_name
             from skill_mcp_tool_bindings smb
             join skills s on s.id = smb.skill_id
             join mcp_tools mt on mt.id = smb.mcp_tool_id
             where smb.skill_id = any($1::uuid[])
             order by s.name`,
            [skillIds],
          )
        : { rows: [] };

    const toolsBySkill = new Map();
    for (const row of toolBinds.rows) {
      const list = toolsBySkill.get(row.skill_name) ?? [];
      list.push(row.tool_name);
      toolsBySkill.set(row.skill_name, list);
    }

    const issues = [];
    const report = { management: [], domains: {} };

    for (const [skill, expected] of Object.entries(MANAGEMENT_EXPECTED)) {
      const row = skillByName.get(skill);
      if (!row) {
        issues.push({ group: 'management', skill, code: 'MISSING_SKILL' });
        report.management.push({ skill, status: 'missing_skill' });
        continue;
      }
      const actual = toolsBySkill.get(skill) ?? [];
      const missing = expected.filter((t) => !actual.includes(t));
      const ok = missing.length === 0;
      if (!ok) issues.push({ group: 'management', skill, code: 'MISSING_TOOL_BINDINGS', missing, actual });
      report.management.push({ skill, protocol: row.protocol, expected, actual, ok });
    }

    for (const [dept, skills] of Object.entries(DOMAIN_EXPECTED)) {
      report.domains[dept] = [];
      for (const [skill, expected] of Object.entries(skills)) {
        const row = skillByName.get(skill);
        if (!row) {
          issues.push({ group: dept, skill, code: 'MISSING_SKILL' });
          report.domains[dept].push({ skill, status: 'missing_skill' });
          continue;
        }
        const actual = toolsBySkill.get(skill) ?? [];
        const missing = expected.filter((t) => !actual.includes(t));
        const ok = missing.length === 0;
        if (!ok) issues.push({ group: dept, skill, code: 'MISSING_TOOL_BINDINGS', missing, actual });
        report.domains[dept].push({
          skill,
          protocol: row.protocol,
          expectedTools: expected.length ? expected : '(none — prompt-only-v2)',
          actual,
          ok,
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: issues.length === 0,
          issueCount: issues.length,
          issues,
          mcpBindings: mcpBinds.rows,
          report,
        },
        null,
        2,
      ),
    );
    if (issues.length) process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
