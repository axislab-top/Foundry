/**
 * Seed platform-global CEO factual/memory tool skills (idempotent).
 *
 * Usage:
 *   pnpm --filter @service/api exec node scripts/seed-ceo-facts-memory-skills.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFromFile() {
  const tryPaths = [join(__dirname, '../../../.env'), join(__dirname, '../../../.env.local'), join(__dirname, '../../.env')];
  for (const p of tryPaths) {
    try {
      const raw = readFileSync(p, 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const k = m[1];
        let v = m[2].replace(/\r$/, '');
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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

const SKILLS = [
  {
    name: 'memory.search',
    displayName: 'Memory Search',
    description: 'Search company memory for historical decisions and context.',
    category: ['ceo', 'memory', 'orchestration'],
    toolSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 300 },
        topK: { type: 'integer', minimum: 1, maximum: 12 },
        namespacesHint: { type: 'array', items: { type: 'string' }, maxItems: 12 },
      },
      required: ['query'],
    },
  },
  {
    name: 'facts.company.query',
    displayName: 'Company Facts Query',
    description: 'Query real-time facts about company roster, room members, and role presence.',
    category: ['ceo', 'facts', 'orchestration'],
    toolSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        queryType: { type: 'string', enum: ['company_people', 'room_members', 'role_presence', 'org_structure'] },
        roleQuery: { type: 'string', maxLength: 120 },
        ask: { type: 'string', maxLength: 300 },
      },
      required: ['queryType'],
    },
  },
  {
    name: 'department.knowledge.query',
    displayName: 'Department Knowledge Query',
    description: 'Retrieve department-level knowledge and progress context from memory.',
    category: ['ceo', 'department', 'memory', 'orchestration'],
    toolSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        department: { type: 'string', minLength: 1, maxLength: 80 },
        query: { type: 'string', minLength: 2, maxLength: 300 },
        topK: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['department', 'query'],
    },
  },
];

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  let inserted = 0;
  let updated = 0;
  try {
    for (const skill of SKILLS) {
      const exists = await client.query(`select id from skills where company_id is null and name = $1 limit 1`, [skill.name]);
      if (exists.rowCount === 0) {
        await client.query(
          `insert into skills (
            id, company_id, name, display_name, category, description, tool_schema, prompt_template,
            implementation_type, handler_config, required_permissions, security_profile,
            version, semver_version, is_latest, is_public, is_system, is_enabled, metadata
          ) values (
            gen_random_uuid(), null, $1, $2, $3::jsonb, $4, $5::jsonb, null,
            'builtin', null, '[]'::jsonb, 'safe',
            1, '1.0.0', true, true, true, true, '{}'::jsonb
          )`,
          [skill.name, skill.displayName, JSON.stringify(skill.category), skill.description, JSON.stringify(skill.toolSchema)],
        );
        inserted += 1;
      } else {
        await client.query(
          `update skills
           set display_name = $2,
               category = $3::jsonb,
               description = $4,
               tool_schema = $5::jsonb,
               is_system = true,
               is_public = true,
               is_enabled = true,
               updated_at = current_timestamp
           where company_id is null and name = $1`,
          [skill.name, skill.displayName, JSON.stringify(skill.category), skill.description, JSON.stringify(skill.toolSchema)],
        );
        updated += 1;
      }
    }
    console.log(JSON.stringify({ ok: true, total: SKILLS.length, inserted, updated, names: SKILLS.map((x) => x.name) }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
