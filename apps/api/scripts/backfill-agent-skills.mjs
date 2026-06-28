/**
 * Backfill agent skills for existing company agents.
 * - source of truth: global `skills` table by name (company_id IS NULL)
 * - names source: role defaults + marketplace recommendedSkills
 * - idempotent on (agent_id, skill_id)
 *
 * Usage:
 *   pnpm --filter @service/api run backfill:agent-skills
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

function defaultSkillsByRole(role) {
  const map = {
    ceo: [
      'ceo-strategic-breakdown',
      'ceo-heartbeat-orchestrator',
      'ceo-task-assigner',
      'ceo-budget-guardian',
      'ceo-approval-initiator',
      'ceo-memory-strategist',
      'ceo-cross-department-coordinator',
      'ceo-performance-analyzer',
      'ceo-risk-assessor',
      'ceo-model-router-optimizer',
    ],
    director: [
      'echo',
      'web-search',
      'file-read',
      'notes-append',
      'slack-send',
      'director-task-delegator',
      'director-subordinate-reviewer',
      'director-team-performance-coach',
      'director-progress-reporter',
    ],
    board_member: ['echo', 'web-search', 'heartbeat'],
    executor: ['echo', 'code-run', 'file-read', 'file-write', 'github-create-issue'],
  };
  return map[role] ?? ['echo'];
}

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const skillsRes = await client.query(
      `select id, name from skills where company_id is null`,
    );
    const skillByName = new Map(skillsRes.rows.map((r) => [r.name, r.id]));

    const marketplaceRes = await client.query(
      `select id, recommended_skills from marketplace_agents`,
    );
    const marketplaceSkillNamesById = new Map(
      marketplaceRes.rows.map((r) => [
        r.id,
        Array.isArray(r.recommended_skills)
          ? r.recommended_skills.map((x) => String(x ?? '').trim()).filter(Boolean)
          : [],
      ]),
    );

    const agentsRes = await client.query(
      `select id, company_id, role, metadata->>'marketplaceAgentId' as marketplace_agent_id from agents`,
    );

    let inserted = 0;
    let touchedAgents = 0;
    const missingSummary = [];

    for (const a of agentsRes.rows) {
      const defaults = defaultSkillsByRole(String(a.role));
      const marketplace = a.marketplace_agent_id
        ? marketplaceSkillNamesById.get(a.marketplace_agent_id) ?? []
        : [];
      const names = Array.from(new Set([...defaults, ...marketplace]));
      const missing = names.filter((n) => !skillByName.has(n));
      if (missing.length > 0) {
        missingSummary.push({
          agentId: a.id,
          role: a.role,
          missing,
        });
        continue;
      }

      let insertedForAgent = 0;
      for (const n of names) {
        const skillId = skillByName.get(n);
        if (!skillId) continue;
        const r = await client.query(
          `
          insert into agent_skills (company_id, agent_id, skill_id, source, is_temporary, expires_at, created_at)
          values ($1, $2, $3, 'backfill_global_skills', false, null, current_timestamp)
          on conflict (agent_id, skill_id) do nothing
        `,
          [a.company_id, a.id, skillId],
        );
        const nInserted = Number(r.rowCount ?? 0);
        inserted += nInserted;
        insertedForAgent += nInserted;
      }
      if (insertedForAgent > 0) touchedAgents += 1;
    }

    if (missingSummary.length > 0) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            message: 'Backfill aborted: missing global skills for some agents',
            missingSummary,
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          agents: agentsRes.rowCount ?? 0,
          touchedAgents,
          insertedAgentSkills: inserted,
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
