#!/usr/bin/env node
/** 直连 RabbitMQ RPC 验证 fileAssets.registerFromContent */
import amqp from 'amqplib';
import { randomUUID } from 'crypto';

const COMPANY_ID = process.env.E2E_COMPANY_ID?.trim() || '00b5bae5-e048-439c-b8b4-8a53599ae81b';
const WORKER_ACTOR = process.env.WORKER_ACTOR_USER_ID?.trim() || '00000000-0000-4000-8000-000000000001';
const QUEUE = process.env.API_RMQ_RPC_QUEUE?.trim() || 'api-rpc-queue';

const content = `# E2E 文件登记探针\n\n${'测试 Markdown 正文。'.repeat(30)}\n`;

async function main() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672');
  const ch = await conn.createChannel();
  const q = await ch.assertQueue('', { exclusive: true, autoDelete: true });
  const correlationId = randomUUID();

  const payload = {
    companyId: COMPANY_ID,
    actor: { id: WORKER_ACTOR, roles: ['admin'] },
    data: {
      content,
      name: 'e2e-probe-deliverable.md',
      contentType: 'text/markdown',
      sourceType: 'agent',
      category: 'report',
      ingest: false,
    },
  };

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('RPC timeout 30s')), 30_000);
    ch.consume(
      q.queue,
      (msg) => {
        if (!msg || msg.properties.correlationId !== correlationId) return;
        clearTimeout(timer);
        const body = JSON.parse(msg.content.toString());
        if (body.err) {
          reject(new Error(JSON.stringify(body.err)));
        } else {
          resolve(body.response ?? body);
        }
        ch.ack(msg);
      },
      { noAck: false },
    );

    ch.sendToQueue(QUEUE, Buffer.from(JSON.stringify({ pattern: 'fileAssets.registerFromContent', data: payload })), {
      correlationId,
      replyTo: q.queue,
    });
  }).then((res) => {
    console.log('registerFromContent OK:', JSON.stringify(res, null, 2));
  });

  await ch.close();
  await conn.close();
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
