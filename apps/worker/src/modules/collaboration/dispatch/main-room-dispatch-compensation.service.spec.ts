import { MainRoomDispatchCompensationService } from './main-room-dispatch-compensation.service.js';

describe('MainRoomDispatchCompensationService', () => {
  function setup(opts: { enabled?: boolean; dedupe?: boolean }) {
    const config = {
      isCollabMainRoomDispatchCompensationEnabled: () => opts.enabled ?? true,
      getCollabMainRoomAppendAgentRetryAttempts: () => 2,
      getCollaborationMentionRpcTimeoutMs: () => 5000,
      getRedisKeyPrefix: () => 'pfx:',
    } as any;
    const redisCache = {
      setNxPx: jest.fn().mockResolvedValue(opts.dedupe ?? true),
    } as any;
    const apiRpc = {
      send: jest.fn(),
    } as any;
    const collabNotify = {
      publishDispatchPartialFailed: jest.fn().mockResolvedValue(undefined),
    } as any;
    const programLifecycle = {
      isEnabled: () => false,
      onCompensation: jest.fn(),
    } as any;
    const svc = new MainRoomDispatchCompensationService(
      config,
      redisCache,
      apiRpc,
      collabNotify,
      programLifecycle,
    );
    return { svc, apiRpc, collabNotify, redisCache };
  }

  it('notifyDispatchPartialFailure publishes ws and appends ceo notice', async () => {
    const { svc, apiRpc, collabNotify } = setup({});
    const { of } = await import('rxjs');
    apiRpc.send.mockReturnValue(of({ id: 'msg-1' }));

    await svc.notifyDispatchPartialFailure({
      companyId: 'co1',
      mainRoomId: 'room-main',
      ceoAgentId: 'ceo-1',
      planMessageId: 'plan-msg',
      skipped: [{ departmentSlug: 'engineering', reason: 'no_director', planTaskId: 't1' }],
      slugToLabel: new Map([['engineering', '工程部']]),
    });

    expect(collabNotify.publishDispatchPartialFailed).toHaveBeenCalled();
    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.messages.appendAgent',
      expect.objectContaining({
        roomId: 'room-main',
        agentId: 'ceo-1',
      }),
    );
  });

  it('skips when compensation disabled', async () => {
    const { svc, apiRpc } = setup({ enabled: false });
    await svc.notifyDispatchPartialFailure({
      companyId: 'co1',
      mainRoomId: 'room-main',
      ceoAgentId: 'ceo-1',
      skipped: [{ departmentSlug: 'engineering', reason: 'no_director' }],
    });
    expect(apiRpc.send).not.toHaveBeenCalled();
  });

  it('notifyAppendFailure appends ceo notice with dedupe', async () => {
    const { svc, apiRpc } = setup({});
    const { of } = await import('rxjs');
    apiRpc.send.mockReturnValue(of({ id: 'msg-2' }));

    await svc.notifyAppendFailure({
      companyId: 'co1',
      mainRoomId: 'room-main',
      ceoAgentId: 'ceo-1',
      scopeKey: 'wave_nudge:goal-1',
      headline: '【编排监督】下一波派发提示未能写入主群',
      detail: 'rpc timeout',
      kind: 'main_room_wave_nudge_compensation',
    });

    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.messages.appendAgent',
      expect.objectContaining({
        roomId: 'room-main',
        agentId: 'ceo-1',
        metadata: expect.objectContaining({ kind: 'main_room_wave_nudge_compensation' }),
      }),
    );
  });

  it('notifyDeferredHeavyFailure appends ceo notice with dedupe', async () => {
    const { svc, apiRpc } = setup({});
    const { of } = await import('rxjs');
    apiRpc.send.mockReturnValue(of({ id: 'msg-3' }));

    await svc.notifyDeferredHeavyFailure({
      companyId: 'co1',
      mainRoomId: 'room-main',
      ceoAgentId: 'ceo-1',
      sourceMessageId: 'msg-src',
      heavyKind: 'dispatch_plan_compile_and_flush',
      errMessage: 'timeout',
    });

    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.messages.appendAgent',
      expect.objectContaining({
        roomId: 'room-main',
        agentId: 'ceo-1',
        metadata: expect.objectContaining({ kind: 'main_room_deferred_heavy_failed' }),
      }),
    );
  });
});
