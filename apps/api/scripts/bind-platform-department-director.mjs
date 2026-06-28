/**
 * 将商城部门主管 Agent 绑定为平台部门总监（与 PlatformDepartmentsAdminService.setDirector 行为对齐）。
 *
 * Usage:
 *   node scripts/bind-platform-department-director.mjs <departmentSlug> <marketplaceAgentSlug>
 *
 * Example:
 *   node scripts/bind-platform-department-director.mjs engineering director-engineering-v1
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_DEPARTMENT_HEAD_MANAGEMENT_SKILL_SLUGS = [
  'director-task-delegator',
  'director-subordinate-reviewer',
  'director-team-performance-coach',
  'director-progress-reporter',
];

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

function mergeDepartmentHeadRecommendedSkills(existing) {
  const ordered = [...DEFAULT_DEPARTMENT_HEAD_MANAGEMENT_SKILL_SLUGS];
  const seen = new Set(ordered);
  for (const x of existing ?? []) {
    const t = typeof x === 'string' ? x.trim() : '';
    if (t && !seen.has(t)) {
      ordered.push(t);
      seen.add(t);
    }
  }
  return ordered;
}

async function main() {
  const deptSlug = process.argv[2]?.trim();
  const agentSlug = process.argv[3]?.trim();
  if (!deptSlug || !agentSlug) {
    console.error('Usage: node bind-platform-department-director.mjs <departmentSlug> <marketplaceAgentSlug>');
    process.exit(1);
  }

  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const deptRes = await client.query(
      `SELECT id, slug, display_name, director_marketplace_agent_id FROM platform_departments WHERE slug = $1`,
      [deptSlug],
    );
    if (deptRes.rowCount === 0) {
      throw new Error(`平台部门不存在: ${deptSlug}`);
    }
    const dept = deptRes.rows[0];

    const agentRes = await client.query(
      `SELECT id, slug, name, recommended_skills, agent_category, department_roles FROM marketplace_agents WHERE slug = $1`,
      [agentSlug],
    );
    if (agentRes.rowCount === 0) {
      throw new Error(`商城 Agent 不存在: ${agentSlug}（请先运行 seed:department-heads）`);
    }
    const agent = agentRes.rows[0];
    if (agent.slug === 'ceo') {
      throw new Error('不能将 CEO 设为部门总监');
    }

    const conflict = await client.query(
      `
        SELECT id, slug FROM platform_departments
        WHERE director_marketplace_agent_id = $1 AND slug <> $2
      `,
      [agent.id, deptSlug],
    );
    if (conflict.rowCount > 0) {
      throw new Error(
        `Agent ${agentSlug} 已是部门 ${conflict.rows[0].slug} 的总监，请先解绑后再绑定到 ${deptSlug}`,
      );
    }

    const mergedSkills = mergeDepartmentHeadRecommendedSkills(agent.recommended_skills);
    const departmentRoles = [dept.slug, String(dept.display_name || '').trim()].filter(Boolean);

    await client.query('BEGIN');
    try {
      await client.query(
        `
          UPDATE platform_departments
          SET director_marketplace_agent_id = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
        [agent.id, dept.id],
      );
      await client.query(
        `
          UPDATE marketplace_agents
          SET
            agent_category = 'department_head',
            department_roles = $1::text[],
            recommended_skills = $2::jsonb,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `,
        [departmentRoles, JSON.stringify(mergedSkills), agent.id],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    console.log(
      JSON.stringify({
        ok: true,
        department: { slug: dept.slug, displayName: dept.display_name },
        director: { id: agent.id, slug: agent.slug, name: agent.name },
        departmentRoles,
        recommendedSkills: mergedSkills,
      }),
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
