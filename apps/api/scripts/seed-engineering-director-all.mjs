/**
 * One-shot upgrade for Engineering Director (skills + bindings + GitOps + marketplace + audit).
 *
 * Usage:
 *   pnpm -C apps/api run seed:engineering-director-all
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFilesInto(target) {
  for (const p of [
    join(__dirname, '../../../.env'),
    join(__dirname, '../../../.env.local'),
    join(__dirname, '../.env'),
  ]) {
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = m[2].replace(/\r$/, '');
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
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
  'seed-engineering-director-skills.mjs',
  'seed-engineering-director-skill-tool-bindings.mjs',
  'seed-engineering-employee-execution-skills.mjs',
  'seed-department-heads.mjs',
  'audit-engineering-director-skills.mjs',
];

for (const step of steps) {
  const scriptPath = resolve(__dirname, step);
  const res = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit', env: childEnv });
  if (res.status !== 0) {
    throw new Error(`Engineering director upgrade failed at ${step} (exit=${res.status ?? 'unknown'})`);
  }
}

console.log(JSON.stringify({ ok: true, steps: steps.length, scripts: steps }, null, 2));
