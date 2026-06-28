/**
 * GitOps: upsert platform-global skills from skills/platform (each SKILL.md)
 *
 * Usage:
 *   node apps/api/scripts/seed-skills-from-md.mjs
 *   node apps/api/scripts/seed-skills-from-md.mjs --dry-run
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseSkillMdToDbPayload } from '@foundry/skill-md';
import { toCategoryJson } from './lib/seed-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');
const platformDir = join(repoRoot, 'skills/platform');

function loadEnvFromFile() {
  const tryPaths = [join(repoRoot, '.env'), join(repoRoot, '.env.local'), join(__dirname, '../.env')];
  for (const p of tryPaths) {
    try {
      const raw = readFileSync(p, 'utf8');
      for (const line of raw.split('\n')) {
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

function discoverSkillMdPaths() {
  const out = [];
  if (!statSync(platformDir, { throwIfNoEntry: false })) return out;
  for (const ent of readdirSync(platformDir)) {
    const dir = join(platformDir, ent);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const md = join(dir, 'SKILL.md');
    try {
      statSync(md);
      out.push(md);
    } catch {
      // skip
    }
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  loadEnvFromFile();
  const paths = discoverSkillMdPaths();
  if (!paths.length) {
    console.log('No skills/platform/**/SKILL.md found');
    return;
  }
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  if (!dryRun) await client.connect();
  let upserted = 0;
  for (const p of paths) {
    const raw = readFileSync(p, 'utf8');
    let payload;
    try {
      ({ payload } = parseSkillMdToDbPayload(raw, { mergeMetadata: { source: 'gitops-skill-md' } }));
    } catch (e) {
      console.warn('skip (invalid SKILL.md):', p, e instanceof Error ? e.message : e);
      continue;
    }
    const categoryJson = toCategoryJson(payload.category?.[0] ?? 'utility');
    const implType =
      payload.implementationType === 'prompt' || !payload.implementationType
        ? 'builtin'
        : ['builtin', 'langgraph', 'api', 'external'].includes(payload.implementationType)
          ? payload.implementationType
          : 'builtin';
    console.log(dryRun ? '[dry-run]' : '[upsert]', payload.name);
    if (dryRun) continue;
    const exists = await client.query(
      `select id from skills where company_id is null and name = $1 limit 1`,
      [payload.name],
    );
    const metaJson = JSON.stringify(payload.metadata ?? { source: 'gitops-skill-md' });
    if (exists.rowCount === 0) {
      await client.query(
        `
        insert into skills (
          id, company_id, name, display_name, category, description, tool_schema, prompt_template,
          implementation_type, handler_config, required_permissions, security_profile,
          is_enabled, approval_status, version, semver_version, is_latest, is_public, is_system, metadata, input_schema
        ) values (
          gen_random_uuid(), null, $1, $2, $3, $4, $5::jsonb, $6, $7, '{}'::jsonb, '[]'::jsonb, 'safe',
          true, 'none', 1, '1.0.0', true, true, true, $8::jsonb, $5::jsonb
        )
        `,
        [
          payload.name,
          payload.displayName,
          categoryJson,
          payload.description,
          JSON.stringify(payload.toolSchema),
          payload.promptTemplate,
          implType,
          metaJson,
        ],
      );
    } else {
      await client.query(
        `
        update skills set
          display_name = $2,
          category = $3,
          description = $4,
          tool_schema = $5::jsonb,
          input_schema = $5::jsonb,
          prompt_template = $6,
          implementation_type = $7,
          security_profile = 'safe',
          is_enabled = true,
          is_public = true,
          is_system = true,
          metadata = coalesce(metadata, '{}'::jsonb) || $8::jsonb
        where company_id is null and name = $1
        `,
        [
          payload.name,
          payload.displayName,
          categoryJson,
          payload.description,
          JSON.stringify(payload.toolSchema),
          payload.promptTemplate,
          implType,
          metaJson,
        ],
      );
    }
    upserted += 1;
  }
  if (!dryRun) await client.end();
  console.log(`Done. ${upserted} skill(s) from GitOps md.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
