/**
 * Backfill skill_revisions from skills and repair revision pointers.
 *
 * Goals:
 * 1) Ensure each skill has at least one revision row.
 * 2) Ensure published revisions are approved (for effectiveSkillSnapshots filter).
 * 3) Ensure skills.current_revision_id / published_revision_id are populated.
 *
 * Usage:
 *   pnpm --filter @service/api run backfill:skill-revisions
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
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

async function hasColumn(client, tableName, columnName) {
  const r = await client.query(
    `
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = $1
      and column_name = $2
    limit 1
    `,
    [tableName, columnName],
  );
  return r.rowCount > 0;
}

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  try {
    const hasReviewStatus = await hasColumn(client, 'skill_revisions', 'review_status');
    const hasReviewedAt = await hasColumn(client, 'skill_revisions', 'reviewed_at');

    await client.query('begin');

    // 1) Backfill one published revision for each skill that has none.
    const insertSql = hasReviewStatus
      ? `
      insert into skill_revisions (
        skill_id, company_id, version, status, review_status, reviewed_at,
        name, category, description, tool_schema, prompt_template,
        implementation_type, handler_config, required_permissions,
        is_public, is_system, metadata
      )
      select
        s.id, s.company_id, coalesce(s.version, 1), 'published', 'approved',
        ${hasReviewedAt ? 'current_timestamp' : 'null'},
        s.name, s.category, s.description, s.tool_schema, s.prompt_template,
        s.implementation_type, s.handler_config, coalesce(s.required_permissions, '[]'::jsonb),
        coalesce(s.is_public, true), coalesce(s.is_system, false), s.metadata
      from skills s
      where not exists (
        select 1 from skill_revisions r where r.skill_id = s.id
      )
      `
      : `
      insert into skill_revisions (
        skill_id, company_id, version, status,
        name, category, description, tool_schema, prompt_template,
        implementation_type, handler_config, required_permissions,
        is_public, is_system, metadata
      )
      select
        s.id, s.company_id, coalesce(s.version, 1), 'published',
        s.name, s.category, s.description, s.tool_schema, s.prompt_template,
        s.implementation_type, s.handler_config, coalesce(s.required_permissions, '[]'::jsonb),
        coalesce(s.is_public, true), coalesce(s.is_system, false), s.metadata
      from skills s
      where not exists (
        select 1 from skill_revisions r where r.skill_id = s.id
      )
      `;
    const inserted = await client.query(insertSql);

    // 2) Normalize previously published revisions as approved.
    let approved = { rowCount: 0 };
    if (hasReviewStatus) {
      const approveSql = hasReviewedAt
        ? `
        update skill_revisions
        set review_status = 'approved',
            reviewed_at = coalesce(reviewed_at, created_at, current_timestamp)
        where status = 'published'
          and review_status <> 'approved'
        `
        : `
        update skill_revisions
        set review_status = 'approved'
        where status = 'published'
          and review_status <> 'approved'
        `;
      approved = await client.query(approveSql);
    }

    // 3) Ensure pointers are filled for all skills.
    const pointers = await client.query(`
      update skills s
      set
        current_revision_id = x.current_id,
        published_revision_id = x.published_id
      from (
        select
          r.skill_id,
          (
            select r1.id
            from skill_revisions r1
            where r1.skill_id = r.skill_id
            order by r1.version desc, r1.created_at desc
            limit 1
          ) as current_id,
          (
            select r2.id
            from skill_revisions r2
            where r2.skill_id = r.skill_id
              and r2.status = 'published'
            order by r2.version desc, r2.created_at desc
            limit 1
          ) as published_id
        from skill_revisions r
        group by r.skill_id
      ) x
      where s.id = x.skill_id
        and (
          s.current_revision_id is distinct from x.current_id
          or s.published_revision_id is distinct from x.published_id
        )
    `);

    await client.query('commit');

    const stats = await client.query(`
      select
        (select count(*) from skills) as skills_total,
        (select count(*) from skill_revisions) as revisions_total,
        (select count(*) from skills where published_revision_id is null) as skills_without_published_ptr,
        (select count(*) from skills where current_revision_id is null) as skills_without_current_ptr
    `);

    console.log(
      JSON.stringify(
        {
          ok: true,
          insertedRevisions: Number(inserted.rowCount ?? 0),
          normalizedPublishedToApproved: Number(approved.rowCount ?? 0),
          pointerRowsUpdated: Number(pointers.rowCount ?? 0),
          stats: stats.rows?.[0] ?? null,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    try {
      await client.query('rollback');
    } catch {
      // ignore rollback errors
    }
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
