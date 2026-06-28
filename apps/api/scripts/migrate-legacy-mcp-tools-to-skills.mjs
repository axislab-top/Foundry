/**
 * Phase F2: migrate legacy independent MCP tools (mcp_tools) into Skill-based MCP (skills).
 *
 * What it does:
 * - Copies rows from `mcp_tools` -> `skills` with:
 *   - implementation_type = 'mcp'
 *   - handler_config.mcpTools[0] derived from legacy fields
 *   - tool_schema / input_schema / output_schema carried over
 *   - metadata.migratedFrom.mcpToolId set for idempotency
 * - Backfills `skill_revisions` for newly inserted skills and repairs pointers.
 *
 * What it does NOT do (by default):
 * - It does not delete legacy tables.
 * - Runtime now resolves MCP tools directly from Skill snapshots.
 *
 * Usage:
 *   # dry-run (prints counts only)
 *   DRY_RUN=1 node scripts/migrate-legacy-mcp-tools-to-skills.mjs
 *
 *   # execute
 *   node scripts/migrate-legacy-mcp-tools-to-skills.mjs
 *
 * Env:
 * - DATABASE_URL or DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE
 * - DRY_RUN=1 to avoid writes
 * - BATCH_SIZE=200 (optional)
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
  const dryRun = String(process.env.DRY_RUN ?? '').trim() === '1';
  const batchSize = Math.max(1, Math.min(2000, Number.parseInt(process.env.BATCH_SIZE ?? '200', 10) || 200));

  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  try {
    const hasSkillDisplayName = await hasColumn(client, 'skills', 'display_name');
    const hasSkillInputSchema = await hasColumn(client, 'skills', 'input_schema');
    const hasSkillOutputSchema = await hasColumn(client, 'skills', 'output_schema');
    const hasSkillSecurityProfile = await hasColumn(client, 'skills', 'security_profile');
    const hasSkillIsEnabled = await hasColumn(client, 'skills', 'is_enabled');
    const hasSkillRequiredPermissions = await hasColumn(client, 'skills', 'required_permissions');

    const hasReviewStatus = await hasColumn(client, 'skill_revisions', 'review_status');
    const hasReviewedAt = await hasColumn(client, 'skill_revisions', 'reviewed_at');
    const hasRevisionCategory = await hasColumn(client, 'skill_revisions', 'category');

    const pending = await client.query(
      `
      select count(*)::int as n
      from mcp_tools t
      where not exists (
        select 1
        from skills s
        where (s.metadata->'migratedFrom'->>'mcpToolId') = t.id::text
      )
      `,
    );
    const pendingCount = Number(pending.rows?.[0]?.n ?? 0);

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            dryRun: true,
            pendingLegacyTools: pendingCount,
            note: 'Set DRY_RUN=0 (or unset) to execute migration.',
          },
          null,
          2,
        ),
      );
      return;
    }

    await client.query('begin');

    // Insert in batches for predictable locks.
    let insertedSkillsTotal = 0;
    for (;;) {
      const inserted = await client.query(
        `
        with src as (
          select
            t.*
          from mcp_tools t
          where not exists (
            select 1
            from skills s
            where (s.metadata->'migratedFrom'->>'mcpToolId') = t.id::text
          )
          order by t.updated_at desc
          limit $1
        ),
        ins as (
          insert into skills (
            company_id,
            name,
            ${hasSkillDisplayName ? 'display_name,' : ''}
            description,
            tool_schema,
            ${hasSkillInputSchema ? 'input_schema,' : ''}
            ${hasSkillOutputSchema ? 'output_schema,' : ''}
            implementation_type,
            handler_config,
            ${hasSkillRequiredPermissions ? 'required_permissions,' : ''}
            ${hasSkillSecurityProfile ? 'security_profile,' : ''}
            ${hasSkillIsEnabled ? 'is_enabled,' : ''}
            version,
            is_public,
            is_system,
            metadata
          )
          select
            s.company_id,
            s.name,
            ${hasSkillDisplayName ? 's.display_name,' : ''}
            s.description,
            s.tool_schema,
            ${hasSkillInputSchema ? 's.input_schema,' : ''}
            ${hasSkillOutputSchema ? 's.output_schema,' : ''}
            s.implementation_type,
            s.handler_config,
            ${hasSkillRequiredPermissions ? 's.required_permissions,' : ''}
            ${hasSkillSecurityProfile ? 's.security_profile,' : ''}
            ${hasSkillIsEnabled ? 's.is_enabled,' : ''}
            s.version,
            s.is_public,
            s.is_system,
            s.metadata
          from (
            select
              src.company_id,
              src.name,
              src.display_name,
              src.description,
              src.input_schema as tool_schema,
              src.input_schema as input_schema,
              src.output_schema as output_schema,
              'mcp'::varchar as implementation_type,
              jsonb_build_object(
                'mcpTools',
                jsonb_build_array(
                  jsonb_build_object(
                    'name', src.name,
                    'description', src.description,
                    'inputSchema', src.input_schema,
                    'outputSchema', src.output_schema,
                    'securityProfile', src.security_profile,
                    'transport',
                      case
                        when src.runner_command is not null and length(trim(src.runner_command)) > 0
                          then jsonb_build_object('kind', 'stub', 'note', src.runner_command)
                        else null
                      end
                  )
                )
              ) as handler_config,
              coalesce(src.required_permissions, '[]'::jsonb) as required_permissions,
              src.security_profile as security_profile,
              coalesce(src.is_enabled, false) as is_enabled,
              coalesce(src.version, 1) as version,
              true as is_public,
              false as is_system,
              jsonb_build_object(
                'displayName', src.display_name,
                'isEnabled', coalesce(src.is_enabled, false),
                'migratedFrom', jsonb_build_object(
                  'source', 'legacy_mcp_tools',
                  'mcpToolId', src.id::text,
                  'mcpToolVersion', coalesce(src.version, 1),
                  'migratedAt', now()
                )
              ) as metadata
            from src
          ) s
          returning id
        )
        select count(*)::int as inserted from ins
        `,
        [batchSize],
      );
      const insertedCount = Number(inserted.rows?.[0]?.inserted ?? 0);
      insertedSkillsTotal += insertedCount;
      if (insertedCount === 0) break;
    }

    // Create revisions for any new skills without revisions (idempotent).
    const revSql = hasReviewStatus
      ? `
        insert into skill_revisions (
          skill_id, company_id, version, status, review_status, reviewed_at,
          name, ${hasRevisionCategory ? 'category,' : ''} description, tool_schema, prompt_template,
          implementation_type, handler_config, required_permissions,
          is_public, is_system, metadata
        )
        select
          s.id, s.company_id, coalesce(s.version, 1), 'published', 'approved',
          ${hasReviewedAt ? 'current_timestamp' : 'null'},
          s.name, ${hasRevisionCategory ? 's.category,' : ''} s.description, s.tool_schema, s.prompt_template,
          s.implementation_type, s.handler_config, coalesce(s.required_permissions, '[]'::jsonb),
          coalesce(s.is_public, true), coalesce(s.is_system, false), s.metadata
        from skills s
        where (s.metadata->'migratedFrom'->>'source') = 'legacy_mcp_tools'
          and not exists (select 1 from skill_revisions r where r.skill_id = s.id)
      `
      : `
        insert into skill_revisions (
          skill_id, company_id, version, status,
          name, ${hasRevisionCategory ? 'category,' : ''} description, tool_schema, prompt_template,
          implementation_type, handler_config, required_permissions,
          is_public, is_system, metadata
        )
        select
          s.id, s.company_id, coalesce(s.version, 1), 'published',
          s.name, ${hasRevisionCategory ? 's.category,' : ''} s.description, s.tool_schema, s.prompt_template,
          s.implementation_type, s.handler_config, coalesce(s.required_permissions, '[]'::jsonb),
          coalesce(s.is_public, true), coalesce(s.is_system, false), s.metadata
        from skills s
        where (s.metadata->'migratedFrom'->>'source') = 'legacy_mcp_tools'
          and not exists (select 1 from skill_revisions r where r.skill_id = s.id)
      `;
    const insertedRevisions = await client.query(revSql);

    // Repair pointers for migrated skills.
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
        and (s.metadata->'migratedFrom'->>'source') = 'legacy_mcp_tools'
        and (
          s.current_revision_id is distinct from x.current_id
          or s.published_revision_id is distinct from x.published_id
        )
    `);

    await client.query('commit');

    console.log(
      JSON.stringify(
        {
          ok: true,
          insertedSkills: insertedSkillsTotal,
          insertedRevisions: Number(insertedRevisions.rowCount ?? 0),
          pointerRowsUpdated: Number(pointers.rowCount ?? 0),
          note: 'runtime MCP resolution is Skill-snapshot based (no registrations table dependency).',
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

