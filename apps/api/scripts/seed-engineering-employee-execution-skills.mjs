/**
 * Seed platform-global engineering employee execution skills (GitOps SKILL.md + DB enrich).
 *
 * Skills:
 *   - engineering-fullstack-implementer
 *   - engineering-api-integration
 *   - wechat-miniprogram-scaffold
 *   - code-review-assistant
 *   - ops-playbook
 *   - vendor-onboarding-checklist
 *   - deal-desk-checklist
 *   - office-policy-faq
 *   - ci-pipeline-helper
 *   - prd-writer
 *   - user-story-refiner
 *   - funnel-analyst
 *   - contract-clause-review
 *   - policy-diff
 *   - sla-tracker
 *
 * Runtime: agents must also bind companion builtins (code-run, file-read, file-write, …)
 * via marketplace recommendedSkills or role bootstrap — see metadata.companionSkillNames.
 *
 * Usage:
 *   pnpm -C apps/api run seed:engineering-employee-skills
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { parseSkillMdToDbPayload } from '@foundry/skill-md';
import { loadEnvFromFile, resolveDatabaseUrl, toCategoryJson } from './lib/seed-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');

const SKILL_DIRS = [
  'engineering-fullstack-implementer',
  'engineering-api-integration',
  'wechat-miniprogram-scaffold',
  'wechat-miniprogram-page-builder',
  'code-review-assistant',
  'ops-playbook',
  'vendor-onboarding-checklist',
  'deal-desk-checklist',
  'office-policy-faq',
  'ci-pipeline-helper',
  'prd-writer',
  'user-story-refiner',
  'funnel-analyst',
  'contract-clause-review',
  'policy-diff',
  'sla-tracker',
];

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    status: { type: 'string' },
    summary: { type: 'string' },
    blockers: { type: 'array', items: { type: 'string' } },
  },
};

async function upsertSkill(client, payload) {
  const category = payload.category?.[0] ?? 'engineering';
  const meta = {
    ...(payload.metadata ?? {}),
    source: 'gitops-engineering-employee-skills',
    seededAt: new Date().toISOString(),
  };
  const exists = await client.query(
    `select id from skills where company_id is null and name = $1 limit 1`,
    [payload.name],
  );
  const toolSchemaJson = JSON.stringify(payload.toolSchema ?? { type: 'object', properties: {} });
  const perms = JSON.stringify(
    Array.isArray(meta.requiredPermissions)
      ? meta.requiredPermissions
      : ['engineering:execute', 'read:workspace', 'write:workspace'],
  );

  if (exists.rowCount === 0) {
    const ins = await client.query(
      `
      insert into skills (
        id, company_id, name, display_name, category, description,
        tool_schema, input_schema, output_schema, prompt_template,
        implementation_type, handler_config, required_permissions, security_profile,
        is_enabled, approval_status, approval_request_id, change_reason,
        version, semver_version, is_latest, is_public, is_system, metadata
      ) values (
        gen_random_uuid(), null, $1, $2, $3::jsonb, $4,
        $5::jsonb,         $5::jsonb, $6::jsonb, $7,
        'builtin', $8::jsonb, $9::jsonb, 'safe',
        true, 'none', null, $10,
        1, '1.0.0', true, true, true, $11::jsonb
      )
      returning id
      `,
      [
        payload.name,
        payload.displayName,
        toCategoryJson(category),
        payload.description,
        toolSchemaJson,
        JSON.stringify(OUTPUT_SCHEMA),
        payload.promptTemplate,
        JSON.stringify({ executionMode: 'prompt_completion', companionSkillNames: meta.companionSkillNames ?? [] }),
        perms,
        'seed engineering employee execution skills v1',
        JSON.stringify(meta),
      ],
    );
    return { id: ins.rows[0].id, action: 'inserted' };
  }

  await client.query(
    `
    update skills set
      display_name = $2,
      category = $3::jsonb,
      description = $4,
      tool_schema = $5::jsonb,
      input_schema = $5::jsonb,
      output_schema = $6::jsonb,
      prompt_template = $7,
      implementation_type = 'builtin',
      handler_config = $8::jsonb,
      required_permissions = $9::jsonb,
      security_profile = 'safe',
      is_enabled = true,
      approval_status = 'none',
      change_reason = $10,
      is_public = true,
      is_system = true,
      is_latest = true,
      metadata = coalesce(metadata, '{}'::jsonb) || $11::jsonb,
      updated_at = current_timestamp
    where company_id is null and name = $1
    `,
    [
      payload.name,
      payload.displayName,
      toCategoryJson(category),
      payload.description,
      toolSchemaJson,
      JSON.stringify(OUTPUT_SCHEMA),
      payload.promptTemplate,
      JSON.stringify({ executionMode: 'prompt_completion', companionSkillNames: meta.companionSkillNames ?? [] }),
      perms,
      'seed engineering employee execution skills v1',
      JSON.stringify(meta),
    ],
  );
  return { id: exists.rows[0].id, action: 'updated' };
}

async function verifyCompanionSkills(client, companionNames) {
  const res = await client.query(
    `select name from skills where company_id is null and name = any($1::text[])`,
    [companionNames],
  );
  const have = new Set(res.rows.map((r) => r.name));
  return companionNames.filter((n) => !have.has(n));
}

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const results = [];
    const allCompanions = new Set();

    for (const dir of SKILL_DIRS) {
      const mdPath = join(repoRoot, 'skills/platform', dir, 'SKILL.md');
      const raw = readFileSync(mdPath, 'utf8');
      const { payload } = parseSkillMdToDbPayload(raw, {
        mergeMetadata: { source: 'gitops-engineering-employee-skills' },
      });
      const companions = Array.isArray(payload.metadata?.companionSkillNames)
        ? payload.metadata.companionSkillNames.map(String)
        : [];
      companions.forEach((n) => allCompanions.add(n));

      const row = await upsertSkill(client, payload);
      results.push({ name: payload.name, ...row, companionSkillNames: companions });
    }

    const missingCompanions = await verifyCompanionSkills(client, [...allCompanions]);

    console.log(
      JSON.stringify(
        {
          ok: missingCompanions.length === 0,
          skills: results,
          missingCompanionSkills: missingCompanions,
          hint:
            missingCompanions.length > 0
              ? 'Run pnpm -C apps/api run seed:core-default-skills first'
              : 'Companion builtins exist; bind them to agents via marketplace recommendedSkills or backfill:agent-skills',
        },
        null,
        2,
      ),
    );
    if (missingCompanions.length > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
