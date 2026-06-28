/**
 * Audit marketplace_agents (employee category) recommended_skills vs global skills DB.
 * Usage: node scripts/audit-marketplace-employees-skills.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFromFile() {
  for (const p of [
    join(__dirname, '../../../.env'),
    join(__dirname, '../../../.env.local'),
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
  const host = process.env.POSTGRES_HOST || '127.0.0.1';
  const port = process.env.POSTGRES_PORT || '5432';
  const user = process.env.POSTGRES_USER || 'postgres';
  const pass = process.env.POSTGRES_PASSWORD || 'postgres';
  const db = process.env.DB_DATABASE || process.env.POSTGRES_DB || 'service_db';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

loadEnvFromFile();
const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
await client.connect();

try {
  const globalSkills = await client.query(`select name from skills where company_id is null`);
  const skillSet = new Set(globalSkills.rows.map((r) => r.name));

  const rows = await client.query(`
    select id, name, slug, agent_category, is_published, recommended_skills, department_roles
    from marketplace_agents
    where agent_category = 'employee'
    order by name
  `);

  const report = rows.rows.map((r) => {
    const rec = Array.isArray(r.recommended_skills)
      ? r.recommended_skills.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    const missingInDb = rec.filter((n) => !skillSet.has(n));
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      published: r.is_published,
      recommendedCount: rec.length,
      recommended: rec,
      missingInDb,
      emptyRecommended: rec.length === 0,
      ok: rec.length > 0 && missingInDb.length === 0,
    };
  });

  console.log(
    JSON.stringify(
      {
        summary: {
          total: report.length,
          ok: report.filter((x) => x.ok).length,
          emptyRecommended: report.filter((x) => x.emptyRecommended).length,
          missingSkillsInDb: report.filter((x) => x.missingInDb.length > 0).length,
          onlyBaseExecutor: report.filter(
            (x) =>
              x.recommended.length === 6 &&
              x.recommended.every((n) =>
                ['echo', 'code-run', 'file-read', 'file-write', 'github-create-issue', 'employee-task-reporter'].includes(n),
              ),
          ).length,
        },
        problems: report.filter((x) => !x.ok),
        onlyBaseExecutor: report.filter(
          (x) =>
            x.recommended.length === 6 &&
            x.recommended.every((n) =>
              ['echo', 'code-run', 'file-read', 'file-write', 'github-create-issue', 'employee-task-reporter'].includes(n),
            ),
        ).map((x) => ({ name: x.name, slug: x.slug })),
        all: report,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
