/**
 * Backfill marketplace_agents (employee) recommended_skills in Admin catalog only.
 * Does NOT touch company agents or organization tree.
 *
 * Usage:
 *   pnpm -C apps/api run backfill:marketplace-employee-skills
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadEnvFromFile, resolveDatabaseUrl } from './lib/seed-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_EXECUTOR_SKILLS = [
  'echo',
  'code-run',
  'file-read',
  'file-write',
  'github-create-issue',
  'employee-task-reporter',
];

/** 岗位专用 Skill（须已在全局 skills 表） */
const EXTRA_SKILLS_BY_BASENAME = {
  'engineering-wechat-mini-program-developer': [
    'wechat-miniprogram-scaffold',
    'wechat-miniprogram-page-builder',
  ],
  'engineering-backend-architect': ['engineering-api-integration'],
  'engineering-data-engineer': ['engineering-api-integration'],
  'engineering-feishu-integration-developer': ['engineering-api-integration'],
  'engineering-voice-ai-integration-engineer': ['engineering-api-integration'],
  'engineering-email-intelligence-engineer': ['engineering-api-integration'],
  'engineering-database-optimizer': ['engineering-api-integration'],
  'engineering-rapid-prototyper': ['engineering-fullstack-implementer'],
  'engineering-frontend-developer': ['engineering-fullstack-implementer'],
  'engineering-senior-developer': ['engineering-fullstack-implementer'],
  'engineering-mobile-app-builder': ['engineering-fullstack-implementer'],
  'engineering-ai-engineer': ['engineering-fullstack-implementer'],
  'engineering-code-reviewer': ['code-review-assistant', 'engineering-fullstack-implementer'],
};

const DEFAULT_ENGINEERING_EXTRA = ['engineering-fullstack-implementer'];

function basenameFromSlug(slug) {
  const s = String(slug ?? '').trim();
  if (s.startsWith('agency-engineering-engineering-')) {
    return `engineering-${s.slice('agency-engineering-engineering-'.length)}`;
  }
  if (s.startsWith('agency-')) {
    const rest = s.slice('agency-'.length);
    const idx = rest.indexOf('-');
    if (idx === -1) return rest;
    const division = rest.slice(0, idx);
    const tail = rest.slice(idx + 1);
    if (tail.startsWith(`${division}-`)) {
      return `${division}-${tail.slice(division.length + 1)}`;
    }
    return tail;
  }
  return s;
}

function recommendedSkillsForBasename(baseName, divisionHint) {
  const base = String(baseName ?? '').trim();
  let extra = EXTRA_SKILLS_BY_BASENAME[base];
  if (!extra && (base.startsWith('engineering-') || divisionHint === 'engineering')) {
    extra = DEFAULT_ENGINEERING_EXTRA;
  }
  extra = Array.isArray(extra) ? extra : [];
  return [...new Set([...BASE_EXECUTOR_SKILLS, ...extra])];
}

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const global = await client.query(`select name from skills where company_id is null`);
    const skillSet = new Set(global.rows.map((r) => r.name));

    const rows = await client.query(`
      select id, name, slug, recommended_skills, metadata
      from marketplace_agents
      where agent_category = 'employee'
      order by name
    `);

    const updates = [];
    const errors = [];

    for (const row of rows.rows) {
      const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const basename =
        String(meta.agencyBasename ?? '').trim() || basenameFromSlug(row.slug);
      const division = String(meta.division ?? 'engineering').trim();
      const next = recommendedSkillsForBasename(basename, division);
      const missing = next.filter((n) => !skillSet.has(n));
      if (missing.length) {
        errors.push({ name: row.name, slug: row.slug, missing });
        continue;
      }
      const prev = Array.isArray(row.recommended_skills)
        ? row.recommended_skills.map(String)
        : [];
      const changed =
        prev.length !== next.length || next.some((n, i) => prev[i] !== n) || prev.some((n) => !next.includes(n));
      if (changed) {
        await client.query(
          `update marketplace_agents set recommended_skills = $2::jsonb, updated_at = current_timestamp where id = $1`,
          [row.id, JSON.stringify(next)],
        );
        updates.push({ name: row.name, slug: row.slug, before: prev, after: next });
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: errors.length === 0,
          total: rows.rowCount,
          updated: updates.length,
          unchanged: rows.rowCount - updates.length - errors.length,
          errors,
          updates,
        },
        null,
        2,
      ),
    );
    if (errors.length) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
