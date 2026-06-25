import type { ResponderThinkingStubPayload } from './responderThinkingDevStub';
import { emitCollaborationMockRealtime } from './collaboration-mock-realtime-bridge';

type MockCollaborationMessage = {
  id: string;
  roomId: string;
  senderType: 'human' | 'agent';
  senderId: string;
  messageType: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

/**
 * MOCK：用户发主群消息后，模拟「思考 → 流式 → 正式回复」时序（对齐生产 WS）。
 */
export function scheduleCollaborationMockMainRoomSequence(params: {
  roomId: string;
  sourceMessageId: string;
  humanContent: string;
  ceoAgentId?: string;
  companyId?: string;
}): void {
  const roomId = String(params.roomId ?? '').trim();
  const sourceMessageId = String(params.sourceMessageId ?? '').trim();
  if (!roomId || !sourceMessageId) return;

  const ceoId = params.ceoAgentId ?? 'agent-001';
  const companyId = params.companyId ?? 'mock-company';
  const humanContent = String(params.humanContent ?? '');
  const startedAt = new Date().toISOString();
  const streamId = `mock-stream:${sourceMessageId}`;
  const replyText =
    '收到，我先梳理一下你的需求，并安排相关部门推进。（MOCK 即时回复）';

  window.setTimeout(() => {
    const thinking: ResponderThinkingStubPayload = {
      sourceMessageId,
      status: 'routing',
      responderAgentIds: [],
      startedAt,
    };
    emitCollaborationMockRealtime({ type: 'responder:thinking', payload: thinking });
  }, 120);

  window.setTimeout(() => {
    emitCollaborationMockRealtime({
      type: 'responder:thinking',
      payload: {
        sourceMessageId,
        status: 'thinking',
        responderAgentIds: [ceoId],
        ceoLayer: 'L2',
        startedAt,
      },
    });
  }, 520);

  const chunks = [replyText.slice(0, 18), replyText.slice(18)];
  chunks.forEach((part, idx) => {
    window.setTimeout(() => {
      emitCollaborationMockRealtime({
        type: 'message:chunk',
        payload: {
          roomId,
          streamId,
          senderType: 'agent',
          senderId: ceoId,
          content: part,
          createdAt: new Date().toISOString(),
          metadata: {
            provisional: true,
            directReplyToMessageId: sourceMessageId,
            streamId,
          },
        },
      });
    }, 900 + idx * 280);
  });

  window.setTimeout(() => {
    const finalMessage: MockCollaborationMessage = {
      id: `mock-reply-${sourceMessageId}`,
      roomId,
      senderType: 'agent',
      senderId: ceoId,
      messageType: 'text',
      content: replyText,
      createdAt: new Date().toISOString(),
      metadata: {
        senderName: 'CEO Agent',
        source: 'ceo_v2',
        directReplyToMessageId: sourceMessageId,
        streamId,
      },
    };
    emitCollaborationMockRealtime({ type: 'message:new', payload: finalMessage });
    emitCollaborationMockRealtime({
      type: 'responder:thinking',
      payload: {
        sourceMessageId,
        status: 'idle',
        responderAgentIds: [],
        startedAt,
      },
    });

    emitCollaborationMockRealtime({
      type: 'orchestration:updated',
      payload: {
        id: `mock-orch-${sourceMessageId}`,
        companyId,
        roomId,
        sourceMessageId,
        workerRunId: `mock-run-${sourceMessageId}`,
        status: 'running',
        stage: 'dispatch_plan',
        metadata: {
          routePath: 'orchestration',
          phases: [
            { stage: 'proposed', status: 'done' },
            { stage: 'dispatch_plan', status: 'in_progress' },
          ],
        },
        updatedAt: new Date().toISOString(),
      },
    });

    if (humanContent.includes('【演示派发异常】')) {
      emitCollaborationMockRealtime({
        type: 'dispatch:partial_failed',
        payload: {
          roomId,
          messageId: `mock-plan-${sourceMessageId}`,
          skipped: [{ departmentSlug: 'engineering', reason: 'no_director' }],
        },
      });
    }
  }, 1700);
}
