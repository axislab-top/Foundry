#!/usr/bin/env node
/**
 * 本地对齐 GitHub Actions「lint job」+「test job」的核心步骤（跨平台）。
 * 用法：在仓库根目录执行 `pnpm ci:local`
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, env = {}) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, ...env },
  });
}

run('pnpm install --frozen-lockfile');

run('pnpm lint');

const appsDir = join(root, 'apps');
for (const name of readdirSync(appsDir)) {
  const tsconfig = join(appsDir, name, 'tsconfig.json');
  if (existsSync(tsconfig)) {
    run(`pnpm --filter @service/${name} exec tsc --noEmit`);
  }
}

run('pnpm test');
run('pnpm test:pact', { PACT_DO_NOT_TRACK: 'true' });

console.log('\n[ci-local] 全部完成。\n');
