/**
 * One-shot: Research & Intelligence department director + platform department binding.
 *
 * Usage:
 *   pnpm -C apps/api run seed:research-intelligence-director-all
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFilesInto(target) {
  for (const p of [join(__dirname, '../../../.env'), join(__dirname, '../../../.env.local'), join(__dirname, '../.env')]) {
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = m[2].replace(/\r$/, '');
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (target[m[1]] === undefined) target[m[1]] = v;
      }
      break;
    } catch {
      // ignore
    }
  }
}

const childEnv = { ...process.env };
loadEnvFilesInto(childEnv);

const steps = [
  'seed-research-intelligence-director-skills.mjs',
  'seed-research-intelligence-director-skill-tool-bindings.mjs',
  'seed-department-heads.mjs',
  'seed-platform-execution-skill-companions.mjs',
  'restore-platform-departments.mjs',
];

for (const step of steps) {
  const res = spawnSync(process.execPath, [resolve(__dirname, step)], { stdio: 'inherit', env: childEnv });
  if (res.status !== 0) {
    throw new Error(`Research intelligence director seed failed at ${step} (exit=${res.status ?? 'unknown'})`);
  }
}

console.log(JSON.stringify({ ok: true, departmentSlug: 'research-intelligence', directorSlug: 'director-research-intelligence-v1' }, null, 2));
