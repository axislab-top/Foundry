/**
 * Seed platform-global baseline skills used by role defaults.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/** skills.category 为 jsonb 字符串数组，与 seed-ceo-facts-memory-skills.mjs 一致 */
function toCategoryJson(category) {
  const values = Array.isArray(category) ? category : [String(category)];
  return JSON.stringify(values);
}

const SKILLS = [
  { name: 'echo', category: 'utility', description: 'Echo input for basic diagnostics.' },
  { name: 'web-search', category: 'utility', description: 'Web search capability wrapper.' },
  { name: 'file-read', category: 'utility', description: 'Read file content safely.' },
  { name: 'file-write', category: 'utility', description: 'Write file content safely.' },
  { name: 'code-run', category: 'utility', description: 'Run code execution tasks.' },
  { name: 'notes-append', category: 'utility', description: 'Append notes or logs.' },
  { name: 'slack-send', category: 'collaboration', description: 'Send collaboration notifications.' },
  { name: 'github-create-issue', category: 'engineering', description: 'Create GitHub issue entries.' },
  { name: 'heartbeat', category: 'orchestration', description: 'Basic heartbeat status skill.' },
  { name: 'director-task-delegator', category: 'management', description: 'Delegate tasks to direct reports.' },
  { name: 'director-subordinate-reviewer', category: 'management', description: 'Review subordinate task output.' },
  { name: 'director-team-performance-coach', category: 'management', description: 'Coach team performance improvements.' },
  { name: 'director-progress-reporter', category: 'management', description: 'Generate director progress reports.' },
  { name: 'employee-task-reporter', category: 'management', description: 'Employee reports task completion to director.' },
  {
    name: 'scheduled_playbooks_list',
    category: 'orchestration',
    description: 'List company scheduled Playbook rules.',
    toolSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        enabled: { type: 'boolean' },
        page: { type: 'integer', minimum: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: 'scheduled_playbooks_create',
    category: 'orchestration',
    description: 'Create a scheduled Playbook rule from chat.',
    toolSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'scheduleKind'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 256 },
        description: { type: 'string', maxLength: 4000 },
        objective: { type: 'string', maxLength: 512 },
        playbookName: { type: 'string', maxLength: 256 },
        scheduleKind: { type: 'string', enum: ['daily', 'weekly', 'cron'] },
        timeOfDay: { type: 'string', maxLength: 5 },
        daysOfWeek: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
        cronExpression: { type: 'string', maxLength: 128 },
        timezone: { type: 'string', maxLength: 64 },
        assigneeAgentId: { type: 'string' },
        skillName: { type: 'string', maxLength: 64 },
        deliveryChannel: { type: 'string', enum: ['none', 'main_room'] },
        requiresHumanApproval: { type: 'boolean' },
        chatMessageId: { type: 'string' },
      },
    },
  },
  {
    name: 'scheduled_playbooks_update',
    category: 'orchestration',
    description: 'Update or disable a scheduled Playbook rule.',
    toolSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['scheduleId'],
      properties: {
        scheduleId: { type: 'string' },
        id: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 256 },
        description: { type: 'string', maxLength: 4000 },
        enabled: { type: 'boolean' },
        scheduleKind: { type: 'string', enum: ['daily', 'weekly', 'cron'] },
        timeOfDay: { type: 'string', maxLength: 5 },
        daysOfWeek: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
        cronExpression: { type: 'string', maxLength: 128 },
        timezone: { type: 'string', maxLength: 64 },
        assigneeAgentId: { type: 'string' },
        skillName: { type: 'string', maxLength: 64 },
        deliveryChannel: { type: 'string', enum: ['none', 'main_room'] },
        requiresHumanApproval: { type: 'boolean' },
      },
    },
  },
  {
    name: 'scheduled_playbooks_delete',
    category: 'orchestration',
    description: 'Delete a scheduled Playbook rule.',
    toolSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['scheduleId'],
      properties: {
        scheduleId: { type: 'string' },
        id: { type: 'string' },
      },
    },
  },
];

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    let inserted = 0;
    let updated = 0;
    for (const s of SKILLS) {
      const exists = await client.query(
        `select id from skills where company_id is null and name = $1 limit 1`,
        [s.name],
      );
      if (exists.rowCount === 0) {
        await client.query(
          `
          insert into skills (
            id, company_id, name, category, description, tool_schema, prompt_template,
            implementation_type, handler_config, required_permissions, version, is_public, is_system, metadata
          ) values (
            gen_random_uuid(), null, $1, $2::jsonb, $3, $4::jsonb, null,
            'builtin', null, '[]'::jsonb, 1, true, true, '{}'::jsonb
          )
        `,
          [
            s.name,
            toCategoryJson(s.category),
            s.description,
            JSON.stringify(
              s.toolSchema ?? { type: 'object', additionalProperties: true, properties: {} },
            ),
          ],
        );
        inserted += 1;
      } else {
        await client.query(
          `
          update skills
          set category = $2::jsonb, description = $3, is_system = true, is_public = true, updated_at = current_timestamp
          where company_id is null and name = $1
        `,
          [s.name, toCategoryJson(s.category), s.description],
        );
        updated += 1;
      }
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          total: SKILLS.length,
          inserted,
          updated,
          names: SKILLS.map((x) => x.name),
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
