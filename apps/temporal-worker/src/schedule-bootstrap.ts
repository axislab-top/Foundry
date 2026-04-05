/**
 * 一次性创建 Schedule（需已启动 Temporal 与 temporal CLI 同版本集群）。
 * 用法：TEMPORAL_ADDRESS=127.0.0.1:7233 pnpm --filter @service/temporal-worker run schedule:bootstrap
 */
import { Client, Connection } from '@temporalio/client';

const address = process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233';
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? 'foundry-company';
const scheduleId = process.env.TEMPORAL_HEARTBEAT_SCHEDULE_ID ?? 'foundry-heartbeat';
const intervalMinutes = Number(process.env.TEMPORAL_HEARTBEAT_INTERVAL_MINUTES ?? '2');

const connection = await Connection.connect({ address });
const client = new Client({ connection });

try {
  await client.schedule.create({
    scheduleId,
    spec: {
      intervals: [{ every: `${intervalMinutes}m` }],
    },
    action: {
      type: 'startWorkflow',
      workflowType: 'heartbeatFanoutWorkflow',
      taskQueue,
    },
  });
  console.log(`Schedule created: ${scheduleId} every ${intervalMinutes}m on queue ${taskQueue}`);
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('already exists') || msg.includes('AlreadyExists')) {
    console.log(`Schedule already exists: ${scheduleId}`);
  } else {
    throw e;
  }
}

await connection.close();
