import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const destDir = join(pkgRoot, 'dist', 'prompts');
mkdirSync(destDir, { recursive: true });
for (const name of ['ceo-memory-cortex-summary.prompt.md', 'ceo-early-exit-decider.prompt.md']) {
  const srcMd = join(pkgRoot, 'src', 'prompts', name);
  copyFileSync(srcMd, join(destDir, name));
}
