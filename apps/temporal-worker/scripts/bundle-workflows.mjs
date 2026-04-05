import { bundleWorkflowCode } from '@temporalio/worker';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// import.meta.url 在 scripts/ 下，上一级为 temporal-worker 包根目录（勿再 dirname，否则会落到 apps/）
const root = fileURLToPath(new URL('..', import.meta.url));
const workflowsPath = resolve(root, 'src', 'workflows.ts');

const { code } = await bundleWorkflowCode({
  workflowsPath,
});

const outDir = resolve(root, 'dist');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'workflow-bundle.js'), code);
console.log('workflow bundle written to dist/workflow-bundle.js');
