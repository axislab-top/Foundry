/**
 * Backfill CEO core skills for all existing company CEO agents.
 * Idempotent: only inserts missing agent_skills rows.
 *
 * Usage:
 *   pnpm --filter @service/api run backfill:ceo-skills
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { CEO_RECOMMENDED_SKILL_NAMES } from './lib/ceo-core-skills.mjs';

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

const CEO_SKILL_NAMES = CEO_RECOMMENDED_SKILL_NAMES;

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    // Resolve global CEO skill ids.
    const skillsRes = await client.query(
      `
      select id, name
      from skills
      where company_id is null and name = any($1::text[])
    `,
      [CEO_SKILL_NAMES],
    );
    const skillIds = skillsRes.rows.map((r) => r.id);
    const skillNamesFound = new Set(skillsRes.rows.map((r) => r.name));
    const missingSkills = CEO_SKILL_NAMES.filter((n) => !skillNamesFound.has(n));
    if (missingSkills.length > 0) {
      throw new Error(
        `Missing CEO skills in skills table: ${missingSkills.join(', ')}. Run seed:ceo-skills, seed:skills-md, and seed:core-default-skills first.`,
      );
    }

    const ceoAgentsRes = await client.query(
      `
      select id, company_id
      from agents
      where role = 'ceo'
    `,
    );
    const ceoAgents = ceoAgentsRes.rows;

    let inserted = 0;
    let touchedAgents = 0;
    for (const a of ceoAgents) {
      let insertedForAgent = 0;
      for (const skillId of skillIds) {
        const r = await client.query(
          `
          insert into agent_skills (company_id, agent_id, skill_id, created_at)
          values ($1, $2, $3, current_timestamp)
          on conflict (agent_id, skill_id) do nothing
        `,
          [a.company_id, a.id, skillId],
        );
        const n = Number(r.rowCount ?? 0);
        inserted += n;
        insertedForAgent += n;
      }
      if (insertedForAgent > 0) {
        touchedAgents += 1;
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          ceoAgents: ceoAgents.length,
          touchedAgents,
          insertedAgentSkills: inserted,
          skillCountPerCeo: CEO_SKILL_NAMES.length,
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

