import { of } from 'rxjs';

// 规避真实 forward-ref 在 Jest(CJS) 下 `import.meta` 解析失败（启用同目录 __mocks__ 手动 mock）。
jest.mock('./pipeline-v2.forward-ref.js');

import { CollaborationPipelineV2Listener } from './collaboration-pipeline-v2.listener.js';

describe('CollaborationPipelineV2Listener', () => {
  const tenantContext = {
    runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<unknown>) => fn()),
  } as any;

  function makeListener() {
    const publish = jest.fn(async () => true);
    const messaging = {
      publish,
      subscribeWithBackoff: jest.fn(),
    } as any;
    const config = {
      getWorkerActorUserId: () => 'worker-user',
      getCollaborationMentionRpcTimeoutMs: () => 1500,
      getCollaborationIntentClassifiedV20261DeprecatedAt: () => undefined as string | undefined,
      isCollabIntentSinglePublishV20261Enabled: () => false,
      isCollabExecutionLifecycleSingleEvent: () => true,
      isCollabExecutionStateLegacyPerStage: () => false,
    } as any;
    const pipelineOut = {
      routePath: 'orchestration',
      intentDecision: {
        intentType: 'direct_summon',
        confidence: 0.82,
        traceId: 'trace-1',
      },
      output: {
        status: 'ok',
        message: 'Handled by orchestration reply path.',
        payload: {
          fastFinalText: '这是最终回复',
          executionStateStages: ['proposed', 'approved', 'in_progress', 'done', 'reviewed'],
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
    const departmentDirectReply = {
      reply: jest.fn(async () => ({ handled: false, reason: 'skip' })),
    } as any;
    const employeeAutonomous = {
      tryHandleAgentCollaborationMessage: jest.fn().mockResolvedValue({ handled: false }),
    } as any;
    const mainRoomRoundtable = {
      tryScheduleAfterMainRoomPipeline: jest.fn().mockResolvedValue(undefined),
    } as any;
    const responderThinking = {
      publishBestEffort: jest.fn(),
      publishThinking: jest.fn(async () => undefined),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.get') {
          return of({
            id: 'm1',
            roomId: 'r1',
            content: '请推进任务',
            messageType: 'text',
            senderType: 'human',
            senderId: 'u1',
            metadata: {},
          });
        }
        if (pattern === 'agents.findAll') {
          return of({ items: [{ id: 'ceo-1' }] });
        }
        if (pattern === 'collaboration.messages.appendAgent') {
          return of({ ok: true });
        }
        return of({});
      }),
    } as any;
    const listener = new CollaborationPipelineV2Listener(
      messaging,
      config,
      tenantContext,
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
    return { listener, publish, pipelineCoordinator };
  }

  it('publishes execution lifecycle.v1 with full stages (single event)', async () => {
    const { listener, publish } = makeListener();
    await listener.handleMessageReceived({
      eventId: 'e1',
      eventType: 'collaboration.message.received',
      aggregateId: 'm1',
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'c1',
      data: {
        messageId: 'm1',
        roomId: 'r1',
        seq: '1',
        senderType: 'human',
        senderId: 'u1',
        messageType: 'text',
        contentPreview: '请推进任务',
        createdAt: new Date().toISOString(),
      },
    } as any);

    const lifecycle = publish.mock.calls
      .map((x: any[]) => x?.[0])
      .filter((evt: any) => evt?.eventType === 'collaboration.execution.lifecycle.v1');
    expect(lifecycle.length).toBe(1);
    expect(lifecycle[0]?.data?.stages).toEqual([
      'proposed',
      'approved',
      'in_progress',
      'done',
      'reviewed',
    ]);

    const legacy = publish.mock.calls
      .map((x: any[]) => x?.[0])
      .filter((evt: any) => evt?.eventType === 'collaboration.execution.state_changed.v2');
    expect(legacy.length).toBe(0);
  });

  it('dual-write: legacy per-stage when COLLAB_EXECUTION_STATE_LEGACY_PER_STAGE', async () => {
    const publish = jest.fn(async () => true);
    const messaging = { publish, subscribeWithBackoff: jest.fn() } as any;
    const config = {
      getWorkerActorUserId: () => 'worker-user',
      getCollaborationMentionRpcTimeoutMs: () => 1500,
      getCollaborationIntentClassifiedV20261DeprecatedAt: () => undefined as string | undefined,
      isCollabIntentSinglePublishV20261Enabled: () => false,
      isCollabExecutionLifecycleSingleEvent: () => true,
      isCollabExecutionStateLegacyPerStage: () => true,
    } as any;
    const pipelineOut = {
      routePath: 'orchestration',
      intentDecision: { intentType: 'direct_summon', confidence: 0.82, traceId: 'trace-1' },
      output: {
        status: 'ok',
        message: 'ok',
        payload: {
          fastFinalText: 'x',
          executionStateStages: ['proposed', 'approved'],
        },
      },
    };
    const pipelineCoordinator = {
      run: jest.fn(async () => pipelineOut),
      runMainRoomFlow: jest.fn(async () => pipelineOut),
    } as any;
    const listener = new CollaborationPipelineV2Listener(
      messaging,
      config,
      tenantContext,
      pipelineCoordinator,
      {} as any,
      {
        buildRoomContext: jest.fn(async () => ({
          roomType: 'main',
          roomId: 'r1',
          roomName: 'Main',
          memberDirectory: [],
          members: [],
          orgSnapshot: { departments: [] },
        })),
      } as any,
      { reply: jest.fn(async () => ({ handled: false })) } as any,
      { tryHandleAgentCollaborationMessage: jest.fn().mockResolvedValue({ handled: false }) } as any,
      { tryScheduleAfterMainRoomPipeline: jest.fn().mockResolvedValue(undefined) } as any,
      { publishBestEffort: jest.fn(), publishThinking: jest.fn(async () => undefined) } as any,
      { notifyDeferredHeavyFailure: jest.fn().mockResolvedValue(undefined) } as any,
      {
        send: jest.fn((pattern: string) => {
          if (pattern === 'collaboration.messages.get') {
            return of({
              id: 'm1',
              roomId: 'r1',
              content: 'x',
              messageType: 'text',
              senderType: 'human',
              senderId: 'u1',
              metadata: {},
            });
          }
          if (pattern === 'agents.findAll') return of({ items: [{ id: 'ceo-1' }] });
          return of({});
        }),
      } as any,
    );
    await listener.handleMessageReceived({
      eventId: 'e1',
      eventType: 'collaboration.message.received',
      aggregateId: 'm1',
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'c1',
      data: {
        messageId: 'm1',
        roomId: 'r1',
        seq: '1',
        senderType: 'human',
        senderId: 'u1',
        messageType: 'text',
        contentPreview: 'x',
        createdAt: new Date().toISOString(),
      },
    } as any);

    const legacy = publish.mock.calls.filter((c: any[]) => c?.[0]?.eventType === 'collaboration.execution.state_changed.v2');
    expect(legacy.length).toBe(2);
    const lifecycle = publish.mock.calls.filter((c: any[]) => c?.[0]?.eventType === 'collaboration.execution.lifecycle.v1');
    expect(lifecycle.length).toBe(1);
  });

  function appendAgentCalls(apiRpc: { send: jest.Mock }) {
    return apiRpc.send.mock.calls.filter((c: unknown[]) => c[0] === 'collaboration.messages.appendAgent');
  }

  it('strategy_goal_draft: skips appendAgent when inlineReplyHandled (directReply already wrote room)', async () => {
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
      routePath: 'strategy_goal_draft',
      intentDecision: {
        intentType: 'orchestration',
        confidence: 0.9,
        traceId: 'trace-1',
      },
      output: {
        status: 'ok',
        message: 'draft surfaced',
        payload: {
          inlineReplyHandled: true,
          fastFinalText: '战略目标草稿已推送',
          executionStateStages: ['proposed', 'done'],
        },
      },
    };
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.get') {
          return of({
            id: 'm1',
            roomId: 'r1',
            content: '请定目标',
            messageType: 'text',
            senderType: 'human',
            senderId: 'u1',
            metadata: {},
          });
        }
        if (pattern === 'agents.findAll') return of({ items: [{ id: 'ceo-1' }] });
        return of({ ok: true });
      }),
    } as any;
    const pipelineCoordinator = {
      run: jest.fn(async () => pipelineOut),
      runMainRoomFlow: jest.fn(async () => pipelineOut),
    } as any;
    const listener = new CollaborationPipelineV2Listener(
      messaging,
      config,
      tenantContext,
      pipelineCoordinator,
      {} as any,
      {
        buildRoomContext: jest.fn(async () => ({
          roomType: 'main',
          roomId: 'r1',
          roomName: 'Main',
          memberDirectory: [],
          members: [],
          orgSnapshot: { departments: [] },
        })),
      } as any,
      { reply: jest.fn(async () => ({ handled: false })) } as any,
      { tryHandleAgentCollaborationMessage: jest.fn().mockResolvedValue({ handled: false }) } as any,
      { tryScheduleAfterMainRoomPipeline: jest.fn().mockResolvedValue(undefined) } as any,
      { publishBestEffort: jest.fn(), publishThinking: jest.fn(async () => undefined) } as any,
      { notifyDeferredHeavyFailure: jest.fn().mockResolvedValue(undefined) } as any,
      apiRpc,
    );
    await listener.handleMessageReceived({
      eventId: 'e1',
      eventType: 'collaboration.message.received',
      aggregateId: 'm1',
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'c1',
      data: {
        messageId: 'm1',
        roomId: 'r1',
        seq: '1',
        senderType: 'human',
        senderId: 'u1',
        messageType: 'text',
        contentPreview: '请定目标',
        createdAt: new Date().toISOString(),
      },
    } as any);
    expect(appendAgentCalls(apiRpc).length).toBe(0);
  });

  it('strategy_goal_draft: appendAgent fallback when inlineReplyHandled is false', async () => {
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
      routePath: 'strategy_goal_draft',
      intentDecision: {
        intentType: 'orchestration',
        confidence: 0.9,
        traceId: 'trace-1',
      },
      output: {
        status: 'ok',
        message: 'draft',
        payload: {
          fastFinalText: 'legacy path final text',
          executionStateStages: ['proposed', 'done'],
        },
      },
    };
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.get') {
          return of({
            id: 'm1',
            roomId: 'r1',
            content: 'x',
            messageType: 'text',
            senderType: 'human',
            senderId: 'u1',
            metadata: {},
          });
        }
        if (pattern === 'agents.findAll') return of({ items: [{ id: 'ceo-1' }] });
        return of({ ok: true });
      }),
    } as any;
    const listener = new CollaborationPipelineV2Listener(
      messaging,
      config,
      tenantContext,
      {
        run: jest.fn(async () => pipelineOut),
        runMainRoomFlow: jest.fn(async () => pipelineOut),
      } as any,
      {} as any,
      {
        buildRoomContext: jest.fn(async () => ({
          roomType: 'main',
          roomId: 'r1',
          roomName: 'Main',
          memberDirectory: [],
          members: [],
          orgSnapshot: { departments: [] },
        })),
      } as any,
      { reply: jest.fn(async () => ({ handled: false })) } as any,
      { tryHandleAgentCollaborationMessage: jest.fn().mockResolvedValue({ handled: false }) } as any,
      { tryScheduleAfterMainRoomPipeline: jest.fn().mockResolvedValue(undefined) } as any,
      { publishBestEffort: jest.fn(), publishThinking: jest.fn(async () => undefined) } as any,
      { notifyDeferredHeavyFailure: jest.fn().mockResolvedValue(undefined) } as any,
      apiRpc,
    );
    await listener.handleMessageReceived({
      eventId: 'e1',
      eventType: 'collaboration.message.received',
      aggregateId: 'm1',
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'c1',
      data: {
        messageId: 'm1',
        roomId: 'r1',
        seq: '1',
        senderType: 'human',
        senderId: 'u1',
        messageType: 'text',
        contentPreview: 'x',
        createdAt: new Date().toISOString(),
      },
    } as any);
    const appends = appendAgentCalls(apiRpc);
    expect(appends.length).toBe(1);
    expect(appends[0]?.[1]?.content).toBe('legacy path final text');
  });

  it('main room: publishes process_failed when CEO agent is missing', async () => {
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
    const pipelineCoordinator = {
      run: jest.fn(),
      runMainRoomFlow: jest.fn(),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.get') {
          return of({
            id: 'm1',
            roomId: 'r1',
            content: 'hello',
            messageType: 'text',
            senderType: 'human',
            senderId: 'u1',
            metadata: {},
          });
        }
        if (pattern === 'agents.findAll') return of({ items: [] });
        return of({});
      }),
    } as any;
    const listener = new CollaborationPipelineV2Listener(
      messaging,
      config,
      tenantContext,
      pipelineCoordinator,
      {} as any,
      {
        buildRoomContext: jest.fn(async () => ({
          roomType: 'main',
          roomId: 'r1',
          roomName: 'Main',
          memberDirectory: [],
          members: [],
          orgSnapshot: { departments: [] },
        })),
      } as any,
      { reply: jest.fn(async () => ({ handled: false })) } as any,
      { tryHandleAgentCollaborationMessage: jest.fn().mockResolvedValue({ handled: false }) } as any,
      { tryScheduleAfterMainRoomPipeline: jest.fn().mockResolvedValue(undefined) } as any,
      { publishBestEffort: jest.fn(), publishThinking: jest.fn(async () => undefined) } as any,
      { notifyDeferredHeavyFailure: jest.fn().mockResolvedValue(undefined) } as any,
      apiRpc,
    );
    await listener.handleMessageReceived({
      eventId: 'e1',
      eventType: 'collaboration.message.received',
      aggregateId: 'm1',
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'c1',
      data: {
        messageId: 'm1',
        roomId: 'r1',
        seq: '1',
        senderType: 'human',
        senderId: 'u1',
        messageType: 'text',
        contentPreview: 'hello',
        createdAt: new Date().toISOString(),
      },
    } as any);
    expect(pipelineCoordinator.runMainRoomFlow).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'collaboration.message.process_failed.v2',
        data: expect.objectContaining({
          messageId: 'm1',
          roomId: 'r1',
          error: expect.stringContaining('ceo_agent_not_found'),
        }),
      }),
      expect.any(Object),
    );
  });

  it('department room: skips automated department task stage system notices', async () => {
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
    const pipelineCoordinator = {
      run: jest.fn(),
      runMainRoomFlow: jest.fn(),
    } as any;
    const departmentDirectReply = {
      reply: jest.fn(async () => ({ handled: true, directorAgentId: 'dir-1' })),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.get') {
          return of({
            id: 'sys-1',
            roomId: 'dept-1',
            content: '【部门任务已创建】任务「调研现有技术栈」已进入部门流程。',
            messageType: 'system',
            senderType: 'human',
            senderId: '00000000-0000-0000-0000-000000000000',
            metadata: {
              source: 'department_task_stage_message',
              sourceEventId: 'evt-1',
              eventType: 'task.created',
            },
          });
        }
        return of({});
      }),
    } as any;
    const listener = new CollaborationPipelineV2Listener(
      messaging,
      config,
      tenantContext,
      pipelineCoordinator,
      {} as any,
      {
        buildRoomContext: jest.fn(async () => ({
          roomType: 'department',
          roomId: 'dept-1',
          roomName: 'Engineering',
          memberDirectory: [],
          members: [],
          orgSnapshot: { departments: [] },
        })),
      } as any,
      departmentDirectReply,
      { tryHandleAgentCollaborationMessage: jest.fn().mockResolvedValue({ handled: false }) } as any,
      { tryScheduleAfterMainRoomPipeline: jest.fn() } as any,
      { publishBestEffort: jest.fn(), publishThinking: jest.fn(async () => undefined) } as any,
      { notifyDeferredHeavyFailure: jest.fn().mockResolvedValue(undefined) } as any,
      { send: apiRpc.send } as any,
    );

    await listener.handleMessageReceived({
      eventId: 'in-1',
      eventType: 'collaboration.chat.message.ingested.v2',
      companyId: 'c1',
      data: {
        messageId: 'sys-1',
        roomId: 'dept-1',
        senderType: 'human',
        messageType: 'system',
        contentPreview: '【部门任务已创建】',
        createdAt: new Date().toISOString(),
      },
    } as any);

    expect(departmentDirectReply.reply).not.toHaveBeenCalled();
    expect(pipelineCoordinator.runMainRoomFlow).not.toHaveBeenCalled();
  });

  // [阶段1.1] 锁定主群「正在思考」气泡的“修正后”时序：
  //   status:'routing' 在 runMainRoomFlow 之前发；
  //   status:'thinking' 由 flow 经 onResponderThinking 回调在「确定接话人、开始生成之前」发；
  //   生成（flow 内部）发生在 thinking 之后。
  // 这修复了此前 thinking 在 flow 返回后才发、导致 CEO 内联回复气泡不出现/滞后的缺陷。
  it('main room thinking-bubble order: routing → thinking (before generation) → generate', async () => {
    const order: string[] = [];
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
      routePath: 'orchestration',
      intentDecision: { intentType: 'direct_summon', confidence: 0.82, traceId: 'trace-1' },
      output: {
        status: 'ok',
        message: 'ok',
        payload: { fastFinalText: 'x', executionStateStages: ['proposed', 'done'] },
      },
    };
    const pipelineCoordinator = {
      run: jest.fn(async () => pipelineOut),
      runMainRoomFlow: jest.fn(async (params: { onResponderThinking?: (n: unknown) => void }) => {
        // 模拟 flow：确定接话人后、生成前回调通知 listener 发 thinking，然后才进入生成。
        params.onResponderThinking?.({
          agentIds: ['ceo-1'],
          routePath: 'ceo_replay_delegate',
          intentType: 'direct_summon',
          ceoLayer: 'L2',
        });
        order.push('generate');
        return pipelineOut;
      }),
    } as any;
    const responderThinking = {
      publishBestEffort: jest.fn((p: { status?: string }) => {
        order.push(`thinking:${p?.status}`);
      }),
      publishThinking: jest.fn(async () => undefined),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'collaboration.messages.get') {
          return of({
            id: 'm1',
            roomId: 'r1',
            content: '请推进任务',
            messageType: 'text',
            senderType: 'human',
            senderId: 'u1',
            metadata: {},
          });
        }
        if (pattern === 'agents.findAll') return of({ items: [{ id: 'ceo-1' }] });
        return of({ ok: true });
      }),
    } as any;
    const listener = new CollaborationPipelineV2Listener(
      messaging,
      config,
      tenantContext,
      pipelineCoordinator,
      {} as any,
      {
        buildRoomContext: jest.fn(async () => ({
          roomType: 'main',
          roomId: 'r1',
          roomName: 'Main',
          memberDirectory: [],
          members: [],
          orgSnapshot: { departments: [] },
        })),
      } as any,
      { reply: jest.fn(async () => ({ handled: false })) } as any,
      { tryHandleAgentCollaborationMessage: jest.fn().mockResolvedValue({ handled: false }) } as any,
      { tryScheduleAfterMainRoomPipeline: jest.fn().mockResolvedValue(undefined) } as any,
      responderThinking,
      { notifyDeferredHeavyFailure: jest.fn().mockResolvedValue(undefined) } as any,
      apiRpc,
    );

    await listener.handleMessageReceived({
      eventId: 'e1',
      eventType: 'collaboration.message.received',
      aggregateId: 'm1',
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'c1',
      data: {
        messageId: 'm1',
        roomId: 'r1',
        seq: '1',
        senderType: 'human',
        senderId: 'u1',
        messageType: 'text',
        contentPreview: '请推进任务',
        createdAt: new Date().toISOString(),
      },
    } as any);

    const routingIdx = order.indexOf('thinking:routing');
    const thinkingIdx = order.indexOf('thinking:thinking');
    const generateIdx = order.indexOf('generate');

    expect(routingIdx).toBeGreaterThanOrEqual(0);
    // 修复后：thinking 在 routing 之后、且在生成之前发出。
    expect(thinkingIdx).toBeGreaterThan(routingIdx);
    expect(generateIdx).toBeGreaterThan(thinkingIdx);
  });
});
