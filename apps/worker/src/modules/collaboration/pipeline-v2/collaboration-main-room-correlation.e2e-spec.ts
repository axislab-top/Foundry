import { of } from 'rxjs';
import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import { CollaborationPipelineV2Listener } from './collaboration-pipeline-v2.listener.js';

/**
 * 轻量「集成」：Listener + mock coordinator/RPC，断言主群审计事件携带 correlation 字段（非全栈 Testcontainers）。
 */
describe('CollaborationPipelineV2Listener main-room correlation (e2e-light)', () => {
  const unified: CollaborationIntentDecisionV20261 = {
    schemaVersion: '2026.1',
    traceId: 'plan-anchor-99',
    roomId: 'r1',
    intentType: 'strategy',
    confidence: 0.91,
    audienceConfidence: 0.91,

    explanation: 'unified',
    routingHints: {
      riskLevel: 'low',
      requiresParallelism: false,
      shouldExecute: false,
      suggestedDepartmentSlugs: [],
    },
  };

  it('publishes v2026_1 intent event with turnMessageId, planAnchorMessageId, routingRootMessageId, runId', async () => {
    const publish = jest.fn(async () => true);
    const messaging = { publish, subscribeWithBackoff: jest.fn() } as any;
    const config = {
      getWorkerActorUserId: () => 'worker-user',
      getCollaborationMentionRpcTimeoutMs: () => 1500,
      getCollaborationIntentClassifiedV20261DeprecatedAt: () => undefined as string | undefined,
      isCollabIntentSinglePublishV20261Enabled: () => false,
      isCollabExecutionLifecycleSingleEvent: () => true,
      isCollabExecutionStateLegacyPerStage: () => false,
    } as any;
    const pipelineOut = {
      intentContract: 'unified_intent_v2026_1' as const,
      intentDecision2026_1: unified,
      intentDecision: {
        intentType: 'strategy',
        confidence: 0.91,
        traceId: 'plan-anchor-99',
        metadata: { classifier: 'intent_layer_unified_v2026_1', intentDecision2026_1: unified },
      },
      routePath: 'orchestration',
      output: {
        status: 'ok',
        message: 'ok',
        payload: {
          fastFinalText: 'reply',
          planning: { traceId: 'plan-anchor-99' },
          executionStateStages: ['proposed', 'done'],
        },
      },
    };
    const pipelineCoordinator = {
      run: jest.fn(async () => pipelineOut),
      runMainRoomFlow: jest.fn(async () => pipelineOut),
    } as any;
    const temporal = {} as any;
    const roomContextService = {
      buildRoomContext: jest.fn(async () => ({
        roomType: 'main',
        roomId: 'r1',
        roomName: 'Main',
        memberDirectory: [],
        members: [],
        orgSnapshot: { departments: [] },
      })),
    } as any;
    const departmentDirectReply = { reply: jest.fn(async () => ({ handled: false, reason: 'skip' })) } as any;
    const employeeAutonomous = {
      tryHandleAgentCollaborationMessage: jest.fn().mockResolvedValue({ handled: false }),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.get') {
          return of({
            id: 'turn-msg-1',
            roomId: 'r1',
            content: 'hello',
            messageType: 'text',
            senderType: 'human',
            senderId: 'u1',
            metadata: {},
          });
        }
        if (pattern === 'agents.findAll') return of({ items: [{ id: 'ceo-1' }] });
        if (pattern === 'collaboration.messages.appendAgent') return of({ ok: true });
        return of({});
      }),
    } as any;

    const mainRoomRoundtable = {
      tryScheduleAfterMainRoomPipeline: jest.fn().mockResolvedValue(undefined),
    } as any;
    const responderThinking = {
      publishThinking: jest.fn().mockResolvedValue(undefined),
      publishDone: jest.fn().mockResolvedValue(undefined),
    } as any;

    const listener = new CollaborationPipelineV2Listener(
      messaging,
      config,
      {} as any, // tenantContext
      pipelineCoordinator,
      temporal,
      roomContextService,
      departmentDirectReply,
      employeeAutonomous,
      mainRoomRoundtable,
      responderThinking,
      { notifyDeferredHeavyFailure: jest.fn().mockResolvedValue(undefined) } as any,
      apiRpc,
    );

    await listener.handleMessageReceived({
      eventId: 'e1',
      eventType: 'collaboration.message.received',
      aggregateId: 'turn-msg-1',
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'c1',
      data: {
        roomId: 'r1',
        messageId: 'turn-msg-1',
        traceId: 'route-root-77',
        messageType: 'text',
        senderType: 'human',
        senderId: 'u1',
        metadata: {},
      },
    } as any);

    const rawCalls = publish.mock.calls as Array<Array<{ eventType?: string; data?: Record<string, unknown> }>>;
    const v2026Call = rawCalls.find((c) => c[0]?.eventType === 'collaboration.intent.classified.v2026_1');
    expect(v2026Call).toBeDefined();
    const data = v2026Call![0]!.data as Record<string, unknown>;
    expect(data.turnMessageId).toBe('turn-msg-1');
    expect(data.routingRootMessageId).toBe('route-root-77');
    expect(data.planAnchorMessageId).toBe('plan-anchor-99');
    expect(typeof data.runId).toBe('string');
    expect(String(data.runId).length).toBeGreaterThan(10);
  });
});
