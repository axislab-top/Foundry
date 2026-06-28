/**
 * Seed all platform global skills used by marketplace/default bindings.
 *
 * Usage:
 *   pnpm --filter @service/api run seed:global-skills
 *
 * Director roster + task tools require (load via .env or export before run):
 *   TOOL_INTERNAL_BASE_URL  e.g. https://gateway.example.com/api
 *   API_INTERNAL_AUTH_SECRET
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 合并加载 env（修复 scripts 下 ../../.env 误指向 apps/.env 的问题） */
function loadEnvFilesInto(target) {
  const tryPaths = [
    join(__dirname, '../../../.env'),
    join(__dirname, '../../../.env.local'),
    join(__dirname, '../.env'),
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
        if (target[k] === undefined) target[k] = v;
      }
    } catch {
      // ignore missing file
    }
  }
}

const childEnv = { ...process.env };
loadEnvFilesInto(childEnv);

const steps = [
  'seed-core-default-skills.mjs',
  'seed-ceo-facts-memory-skills.mjs',
  'seed-ceo-facts-memory-tools-and-bindings.mjs',
  'seed-director-roster-tool-and-skill.mjs',
  'seed-director-subordinate-reviewer-skill.mjs',
  'seed-director-team-performance-coach-skill.mjs',
  'seed-director-progress-reporter-skill.mjs',
  'seed-director-core-execution-tools.mjs',
  'seed-collab-room-peer-summon.mjs',
  'seed-ceo-skills.mjs',
  'seed-marketing-director-skills.mjs',
  'seed-sales-director-skills.mjs',
  'seed-finance-director-skills.mjs',
  'seed-product-director-skills.mjs',
  'seed-engineering-director-skills.mjs',
  'seed-engineering-director-skill-tool-bindings.mjs',
  'seed-engineering-employee-execution-skills.mjs',
  'seed-design-director-skills.mjs',
  'seed-design-director-skill-tool-bindings.mjs',
  'seed-operations-director-skills.mjs',
  'seed-people-director-skills.mjs',
  'seed-hr-director-skill-tool-bindings.mjs',
  'seed-growth-director-skills.mjs',
  'seed-research-intelligence-director-skills.mjs',
  'seed-research-intelligence-director-skill-tool-bindings.mjs',
];

for (const step of steps) {
  const scriptPath = resolve(__dirname, step);
  const res = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    env: childEnv,
  });
  if (res.status !== 0) {
    throw new Error(`Global skills seed failed at ${step} (exit=${res.status ?? 'unknown'})`);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      seededScripts: steps.length,
      scripts: steps,
    },
    null,
    2,
  ),
);
