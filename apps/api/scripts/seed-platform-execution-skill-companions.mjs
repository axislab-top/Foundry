/**
 * Backfill platform execution skills: ensure companion utility skills are on department-head
 * marketplace agents so prompt-skill-completion can invoke file-read / notes-append / etc.
 *
 * Note: file-read, file-write, notes-append are **Skills** (not tools table rows). They appear
 * in Admin under Skills, not Tool bindings. HTTP tools (tool.*) still use skill_tool_bindings.
 *
 * Usage:
 *   pnpm -C apps/api run seed:platform-execution-companions
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseSkillMdToDbPayload } from '@foundry/skill-md';
import { loadEnvFromFile, resolveDatabaseUrl } from './lib/seed-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');
const platformDir = join(repoRoot, 'skills/platform');

/** Always merge onto department-head marketplace recommended_skills. */
const PLATFORM_EXECUTION_UTILITY_SKILL_SLUGS = [
  'echo',
  'file-read',
  'file-write',
  'notes-append',
  'web-search',
  'slack-send',
];

/** Department-head slugs that use GitOps execution / checklist skills. */
const EXECUTION_HEAD_SLUGS = [
  'director-research-intelligence-v1',
  'director-engineering-v1',
  'director-design-v1',
  'director-hr-v1',
  'director-legal-v1',
  'director-supply-chain-v1',
  'director-product-v1',
  'director-paid-media-v1',
  'director-project-management-v1',
  'director-support-v1',
  'director-special-projects-v1',
];

const EXECUTION_SKILL_DIRS = [
  'vendor-onboarding-checklist',
  'user-story-refiner',
  'funnel-analyst',
  'contract-clause-review',
  'policy-diff',
  'deal-desk-checklist',
  'ops-playbook',
  'office-policy-faq',
  'prd-writer',
  'sla-tracker',
];

function discoverCompanionMap() {
  const out = {};
  for (const dir of EXECUTION_SKILL_DIRS) {
    const mdPath = join(platformDir, dir, 'SKILL.md');
    try {
      statSync(mdPath);
    } catch {
      continue;
    }
    const raw = readFileSync(mdPath, 'utf8');
    const { payload } = parseSkillMdToDbPayload(raw);
    const companions = new Set(PLATFORM_EXECUTION_UTILITY_SKILL_SLUGS);
    const meta = payload.metadata ?? {};
    for (const x of Array.isArray(meta.companionSkillNames) ? meta.companionSkillNames : []) {
      const n = String(x ?? '').trim();
      if (n) companions.add(n);
    }
    if (typeof meta.allowedTools === 'string') {
      for (const n of meta.allowedTools.split(/\s+/).map((s) => s.trim()).filter(Boolean)) {
        companions.add(n);
      }
    }
    out[payload.name] = [...companions];
  }
  return out;
}

function mergeUnique(existing, additions) {
  const ordered = [];
  const seen = new Set();
  for (const list of [existing, additions]) {
    for (const x of list ?? []) {
      const t = String(x ?? '').trim();
      if (!t || seen.has(t)) continue;
      ordered.push(t);
      seen.add(t);
    }
  }
  return ordered;
}

async function main() {
  loadEnvFromFile();
  const companionMap = discoverCompanionMap();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const allCompanionNames = [...new Set(Object.values(companionMap).flat())];
    const skillCheck = await client.query(
      `select name from skills where company_id is null and name = any($1::text[])`,
      [allCompanionNames],
    );
    const have = new Set(skillCheck.rows.map((r) => r.name));
    const missing = allCompanionNames.filter((n) => !have.has(n));
    if (missing.length) {
      console.warn('Missing global companion skills (run seed:core-default-skills first):', missing);
    }

    const headUpdates = [];
    for (const slug of EXECUTION_HEAD_SLUGS) {
      const row = await client.query(
        `select id, slug, recommended_skills from marketplace_agents where slug = $1 limit 1`,
        [slug],
      );
      if (!row.rowCount) {
        headUpdates.push({ slug, action: 'skipped', reason: 'marketplace agent not found' });
        continue;
      }
      const existing = Array.isArray(row.rows[0].recommended_skills) ? row.rows[0].recommended_skills : [];
      const merged = mergeUnique(existing, PLATFORM_EXECUTION_UTILITY_SKILL_SLUGS);
      await client.query(
        `update marketplace_agents set recommended_skills = $2::jsonb, updated_at = current_timestamp where id = $1`,
        [row.rows[0].id, JSON.stringify(merged)],
      );
      headUpdates.push({
        slug,
        action: 'updated',
        added: merged.filter((n) => !existing.includes(n)),
        total: merged.length,
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: missing.length === 0,
          companionMap,
          utilitySkills: PLATFORM_EXECUTION_UTILITY_SKILL_SLUGS,
          headUpdates,
          missingCompanionSkills: missing,
          note:
            'Companion skills are bound at agent level (recommended_skills). Skill-level tool.* bindings require rows in tools + skill_tool_bindings (HTTP tools only).',
        },
        null,
        2,
      ),
    );
    if (missing.length) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
