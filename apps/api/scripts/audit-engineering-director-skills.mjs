/**
 * Audit engineering director marketplace agent + skill/tool/MCP bindings.
 * Usage: pnpm -C apps/api run audit:engineering-director-skills
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

const ENGINEERING_DOMAIN_SKILLS = [
  'engineering-code-review-orchestrator',
  'engineering-tech-debt-assessor',
  'engineering-architecture-decision-recorder',
  'engineering-ci-cd-pipeline-manager',
  'engineering-security-scanner',
  'engineering-ai-tool-integrator',
  'engineering-team-velocity-coach',
];

const MANAGEMENT_SKILLS = [
  'director-task-delegator',
  'director-subordinate-reviewer',
  'director-team-performance-coach',
  'director-progress-reporter',
  'department.knowledge.query',
];

const UTILITY_COMPANION_SKILLS = ['echo', 'file-read', 'file-write', 'notes-append', 'web-search', 'slack-send'];

const GITOPS_ENGINEERING_SKILLS = ['code-review-assistant', 'ci-pipeline-helper'];

const ALL = [...MANAGEMENT_SKILLS, ...ENGINEERING_DOMAIN_SKILLS];

/** Expected after seed:engineering-director-skill-bindings */
const EXPECTED_TOOL_BINDINGS = {
  'director-task-delegator': ['organization_node_agents', 'task_create_and_assign', 'message_send_to_agent'],
  'director-progress-reporter': ['organization_node_agents', 'task_list_by_department'],
  'director-subordinate-reviewer': ['organization_node_agents', 'task_list_by_department', 'message_send_to_agent'],
  'director-team-performance-coach': ['organization_node_agents', 'task_list_by_department', 'message_send_to_agent'],
  'department.knowledge.query': ['ceo_department_knowledge_query'],
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
};

const PROMPT_ONLY_ENGINEERING_SKILLS = [
  'engineering-tech-debt-assessor',
  'engineering-architecture-decision-recorder',
];

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const agentRes = await client.query(
      `select slug, name, recommended_skills, is_published, system_prompt, metadata from marketplace_agents where slug = 'director-engineering-v1' limit 1`,
    );
    const skillsRes = await client.query(
      `select id, name, implementation_type, handler_config, metadata, prompt_template
       from skills where company_id is null and name = any($1::text[])`,
      [ALL],
    );
    const skillIds = skillsRes.rows.map((r) => r.id);
    const toolBinds =
      skillIds.length > 0
        ? await client.query(
            `select s.name as skill_name, t.name as tool_name, stb.position
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
    const missingSkills = ALL.filter((n) => !skillsRes.rows.some((r) => r.name === n));
    if (missingSkills.length) issues.push({ code: 'MISSING_SKILLS', skills: missingSkills });

    for (const [skill, expected] of Object.entries(EXPECTED_TOOL_BINDINGS)) {
      const actual = toolsBySkill.get(skill) ?? [];
      const missing = expected.filter((t) => !actual.includes(t));
      if (missing.length) issues.push({ code: 'MISSING_TOOL_BINDINGS', skill, missing, actual });
    }

    for (const skill of ENGINEERING_DOMAIN_SKILLS) {
      const row = skillsRes.rows.find((r) => r.name === skill);
      if (!row) continue;
      const protocol = row.metadata?.protocol ?? row.handler_config?.protocol ?? null;
      const bound = toolsBySkill.get(skill) ?? [];
      if (PROMPT_ONLY_ENGINEERING_SKILLS.includes(skill)) {
        if (protocol !== 'prompt-only-v2') {
          issues.push({ code: 'ENGINEERING_SKILL_PROTOCOL_MISMATCH', skill, expected: 'prompt-only-v2', actual: protocol });
        }
        continue;
      }
      const expected = EXPECTED_TOOL_BINDINGS[skill] ?? [];
      const missing = expected.filter((t) => !bound.includes(t));
      if (missing.length || protocol !== 'tool-bound-v2') {
        issues.push({
          code: 'ENGINEERING_SKILL_NOT_UPGRADED',
          skill,
          protocol,
          missingToolBindings: missing,
          toolCount: bound.length,
        });
      }
    }

    const recommended = Array.isArray(agentRes.rows[0]?.recommended_skills)
      ? agentRes.rows[0].recommended_skills
      : [];
    const missingCompanions = UTILITY_COMPANION_SKILLS.filter((s) => !recommended.includes(s));
    if (missingCompanions.length) {
      issues.push({ code: 'MISSING_MARKETPLACE_COMPANION_SKILLS', missing: missingCompanions });
    }
    const missingGitops = GITOPS_ENGINEERING_SKILLS.filter((s) => !recommended.includes(s));
    if (missingGitops.length) {
      issues.push({ code: 'MISSING_MARKETPLACE_GITOPS_SKILLS', missing: missingGitops });
    }
    const metaVersion = agentRes.rows[0]?.metadata?.version ?? null;
    if (metaVersion !== 'v2') {
      issues.push({ code: 'MARKETPLACE_METADATA_VERSION', expected: 'v2', actual: metaVersion });
    }
    const prompt = agentRes.rows[0]?.system_prompt ?? '';
    if (!String(prompt).includes('工程域执行协议（v2）')) {
      issues.push({ code: 'MARKETPLACE_PROMPT_MISSING_V2_PROTOCOL' });
    }

    const deptBind = await client.query(
      `select pd.slug, ma.slug as director_slug
       from platform_departments pd
       left join marketplace_agents ma on ma.id = pd.director_marketplace_agent_id
       where pd.slug = 'engineering'`,
    );

    console.log(
      JSON.stringify(
        {
          ok: issues.length === 0,
          issueCount: issues.length,
          issues,
          platformDepartment: deptBind.rows[0] ?? null,
          marketplaceAgent: agentRes.rows[0] ?? null,
          skills: skillsRes.rows.map((r) => ({
            name: r.name,
            implementationType: r.implementation_type,
            protocol: r.metadata?.protocol ?? r.handler_config?.protocol ?? null,
            promptLen: (r.prompt_template ?? '').length,
            tools: toolsBySkill.get(r.name) ?? [],
          })),
          mcpBindings: mcpBinds.rows,
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
