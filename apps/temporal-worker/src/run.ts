import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const address = process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233';
const bundlePath = existsSync(resolve(__dirname, 'workflow-bundle.js'))
  ? resolve(__dirname, 'workflow-bundle.js')
  : resolve(__dirname, '../dist/workflow-bundle.js');
const workflowBundle = { code: readFileSync(bundlePath) };

const connection = await NativeConnection.connect({ address });
const worker = await Worker.create({
  connection,
  namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
  taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'foundry-company',
  // 1.15+ 类型要求含 sourceMap；仅 code 运行时已足够
  workflowBundle: workflowBundle as never,
  activities,
});

await worker.run();
