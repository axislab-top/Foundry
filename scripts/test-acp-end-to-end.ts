import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'crypto';
import {
  createAgentMessage,
  MessageIntent,
  parseAgentMessage,
  type AgentMessage,
} from '@foundry/multi-agent-core';

const WS_URL = process.env.ACP_WS_URL || 'http://localhost:3002/collaboration';
const TOKEN = process.env.ACP_TEST_JWT || '';
const COMPANY_ID = process.env.ACP_COMPANY_ID || '';
const ROOM_ID = process.env.ACP_ROOM_ID || '';

async function waitFor<T>(
  socket: Socket,
  event: string,
  timeoutMs: number,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function joinRoomWithRetry(socket: Socket, roomId: string): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    socket.emit('join_room', { roomId });
    try {
      await waitFor<{ roomId: string }>(socket, 'joined', 3000);
      return;
    } catch {
      if (attempt === maxAttempts) throw new Error('join_room failed after retries');
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function run() {
  const enableAcp = process.env.ENABLE_ACP_PROTOCOL === '1';
  console.log('[acp-e2e] ws:', WS_URL);
  console.log('[acp-e2e] ENABLE_ACP_PROTOCOL:', enableAcp ? '1' : '0');
  console.log('[acp-e2e] companyId:', COMPANY_ID);
  console.log('[acp-e2e] roomId:', ROOM_ID);

  if (!enableAcp) {
    throw new Error('ENABLE_ACP_PROTOCOL=1 is required for ACP E2E.');
  }
  if (!TOKEN.trim()) {
    throw new Error('ACP_TEST_JWT is required (set it to a valid access token).');
  }
  if (!COMPANY_ID.trim()) {
    throw new Error('ACP_COMPANY_ID is required.');
  }
  if (!ROOM_ID.trim()) {
    throw new Error('ACP_ROOM_ID is required.');
  }

  const traceId = process.env.ACP_TRACE_ID || randomUUID();
  const message = createAgentMessage({
    traceId,
    fromAgentId: 'ceo-agent-001',
    toAgentId: 'broadcast',
    intent: MessageIntent.TASK_DELEGATE,
    payload: {
      taskId: 'task-123',
      parentTaskId: null,
      inputs: { goal: '策划下个月短视频营销方案' },
      constraints: { budgetCap: 500, slaSeconds: 3600 },
    },
    context: { companyId: COMPANY_ID, sessionId: ROOM_ID },
    priority: 'high',
  });

  console.log('[acp-e2e] sending messageId:', message.messageId);
  console.log('[acp-e2e] traceId:', message.traceId);

  const socket = io(WS_URL, {
    transports: ['websocket'],
    auth: { token: TOKEN, companyId: COMPANY_ID },
    extraHeaders: { 'x-trace-id': traceId },
  });

  socket.on('connect_error', (e) => console.error('[acp-e2e] connect_error:', e));
  socket.on('error', (e) => console.error('[acp-e2e] socket_error:', e));

  await waitFor<void>(socket, 'connect', 10_000);
  console.log('[acp-e2e] connected');

  // Keep business-realistic flow: join room first.
  await new Promise((r) => setTimeout(r, 250));
  await joinRoomWithRetry(socket, ROOM_ID);
  console.log('[acp-e2e] joined room');

  // Phase 1 E2E trigger: send standardized ACP message to Gateway.
  socket.emit('agent-message', message);
  console.log('[acp-e2e] emitted agent-message');

  const ack = await waitFor<AgentMessage>(socket, 'agent-message-acked', 20_000);
  const parsedAck = parseAgentMessage(ack);
  console.log('[acp-e2e] got ack messageId:', parsedAck.messageId);
  console.log('[acp-e2e] ack traceId matches:', parsedAck.traceId === traceId);
  console.log('[acp-e2e] ack status:', parsedAck.status);
  console.log('[acp-e2e] done. traceId:', traceId);
  socket.disconnect();
}

run().catch((e) => {
  console.error('[acp-e2e] failed:', e);
  process.exitCode = 1;
});

