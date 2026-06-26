jest.mock('../../common/redis/gateway-redis-client.js', () => ({
  createGatewayRedisClient: jest.fn(),
}));

import { createGatewayRedisClient } from '../../common/redis/gateway-redis-client.js';
import { CollaborationNotifySubscriber } from './collaboration-notify.subscriber.js';

describe('CollaborationNotifySubscriber', () => {
  const makeConfig = () =>
    ({
      isCollaborationRedisNotifyEnabled: () => true,
      getRedisConfig: () => ({ host: 'localhost', port: 6379, db: 0 }),
    }) as any;

  const makeGateway = () =>
    ({
      emitMessageChunk: jest.fn(),
      broadcastMessageNew: jest.fn(),
      emitApprovalNeeded: jest.fn(),
      emitApprovalResolved: jest.fn(),
      emitTaskProgress: jest.fn(),
      emitRunStepAppended: jest.fn(),
      emitRunStep: jest.fn(),
      emitRunUpdated: jest.fn(),
      emitRunTerminal: jest.fn(),
      emitRunIntervention: jest.fn(),
      emitOrgStructureChanged: jest.fn(),
      emitTaskProgressForRoom: jest.fn(),
      emitOrchestrationUpdated: jest.fn(),
      emitResponderThinking: jest.fn(),
      emitMessageMetadataUpdated: jest.fn(),
    }) as any;

  const makeFakeClient = (capture: { cb?: (message: string) => void }) => ({
    isOpen: true,
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockImplementation((_channel: string, cb: any) => {
      capture.cb = cb;
    }),
    quit: jest.fn().mockResolvedValue(undefined),
  });

  it('should forward message:chunk to gateway.emitMessageChunk', async () => {
    const capture: { cb?: (message: string) => void } = {};
    const fakeClient = makeFakeClient(capture);

    (createGatewayRedisClient as jest.Mock).mockReturnValue(fakeClient);

    const config = makeConfig();
    const gateway = makeGateway();

    const adminNotify = {};

    const sub = new CollaborationNotifySubscriber(config, gateway as any, adminNotify as any);
    await sub.onModuleInit();

    expect(capture.cb).toBeDefined();
    capture.cb!(
      JSON.stringify({
        v: 1,
        event: 'message:chunk',
        companyId: 'company-1',
        roomId: 'room-1',
        payload: { streamId: 'stream-1', messageId: 'm-1', content: 'hi' },
      }),
    );

    expect(gateway.emitMessageChunk).toHaveBeenCalledTimes(1);
    expect(gateway.emitMessageChunk).toHaveBeenCalledWith(
      'company-1',
      'room-1',
      { streamId: 'stream-1', messageId: 'm-1', content: 'hi' },
    );
  });

  it('should forward approval:needed to gateway.emitApprovalNeeded', async () => {
    const capture: { cb?: (message: string) => void } = {};
    const fakeClient = makeFakeClient(capture);

    (createGatewayRedisClient as jest.Mock).mockReturnValue(fakeClient);

    const config = makeConfig();
    const gateway = makeGateway();

    const adminNotify = {};

    const sub = new CollaborationNotifySubscriber(config, gateway as any, adminNotify as any);
    await sub.onModuleInit();

    expect(capture.cb).toBeDefined();
    capture.cb!(
      JSON.stringify({
        v: 1,
        event: 'approval:needed',
        companyId: 'company-1',
        roomId: 'room-1',
        payload: { approvalId: 'ap-1', traceId: 'tr-1', reason: 'need review' },
      }),
    );

    expect(gateway.emitApprovalNeeded).toHaveBeenCalledTimes(1);
    expect(gateway.emitApprovalNeeded).toHaveBeenCalledWith(
      'company-1',
      'room-1',
      { approvalId: 'ap-1', traceId: 'tr-1', reason: 'need review' },
    );
  });

  it('should forward approval:status to gateway.emitApprovalResolved', async () => {
    const capture: { cb?: (message: string) => void } = {};
    const fakeClient = makeFakeClient(capture);

    (createGatewayRedisClient as jest.Mock).mockReturnValue(fakeClient);

    const config = makeConfig();
    const gateway = makeGateway();

    const adminNotify = {};

    const sub = new CollaborationNotifySubscriber(config, gateway as any, adminNotify as any);
    await sub.onModuleInit();

    expect(capture.cb).toBeDefined();
    capture.cb!(
      JSON.stringify({
        v: 1,
        event: 'approval:status',
        companyId: 'company-1',
        roomId: 'room-1',
        payload: { approvalRequestId: 'ap-1', status: 'approved' },
      }),
    );

    expect(gateway.emitApprovalResolved).toHaveBeenCalledTimes(1);
    expect(gateway.emitApprovalResolved).toHaveBeenCalledWith('company-1', 'room-1', {
      approvalRequestId: 'ap-1',
      status: 'approved',
    });
  });

  it('should forward run:step.completed to gateway.emitRunStep', async () => {
    const capture: { cb?: (message: string) => void } = {};
    const fakeClient = makeFakeClient(capture);
    (createGatewayRedisClient as jest.Mock).mockReturnValue(fakeClient);

    const sub = new CollaborationNotifySubscriber(makeConfig(), makeGateway(), {} as any);
    await sub.onModuleInit();

    capture.cb!(
      JSON.stringify({
        v: 1,
        event: 'run:step.completed',
        companyId: 'company-1',
        payload: { runId: 'r1', spanId: 's1' },
      }),
    );

    const gw = (sub as any).gateway;
    expect(gw.emitRunStep).toHaveBeenCalledWith('run:step.completed', 'company-1', {
      runId: 'r1',
      spanId: 's1',
    });
  });

  it('should forward run:failed to gateway.emitRunTerminal', async () => {
    const capture: { cb?: (message: string) => void } = {};
    const fakeClient = makeFakeClient(capture);
    (createGatewayRedisClient as jest.Mock).mockReturnValue(fakeClient);

    const sub = new CollaborationNotifySubscriber(makeConfig(), makeGateway(), {} as any);
    await sub.onModuleInit();

    capture.cb!(
      JSON.stringify({
        v: 1,
        event: 'run:failed',
        companyId: 'company-1',
        payload: { run: { id: 'r1', status: 'failed' } },
      }),
    );

    const gw = (sub as any).gateway;
    expect(gw.emitRunTerminal).toHaveBeenCalledWith('run:failed', 'company-1', {
      run: { id: 'r1', status: 'failed' },
    });
  });

  it('should forward run:intervention to gateway.emitRunIntervention', async () => {
    const capture: { cb?: (message: string) => void } = {};
    const fakeClient = makeFakeClient(capture);
    (createGatewayRedisClient as jest.Mock).mockReturnValue(fakeClient);

    const sub = new CollaborationNotifySubscriber(makeConfig(), makeGateway(), {} as any);
    await sub.onModuleInit();

    capture.cb!(
      JSON.stringify({
        v: 1,
        event: 'run:intervention',
        companyId: 'company-1',
        payload: { runId: 'r1', action: 'pause' },
      }),
    );

    const gw = (sub as any).gateway;
    expect(gw.emitRunIntervention).toHaveBeenCalledWith('company-1', {
      runId: 'r1',
      action: 'pause',
    });
  });

  it('should forward orchestration:updated to gateway.emitOrchestrationUpdated', async () => {
    const capture: { cb?: (message: string) => void } = {};
    const fakeClient = makeFakeClient(capture);
    (createGatewayRedisClient as jest.Mock).mockReturnValue(fakeClient);

    const gateway = makeGateway();
    const sub = new CollaborationNotifySubscriber(makeConfig(), gateway as any, {} as any);
    await sub.onModuleInit();

    capture.cb!(
      JSON.stringify({
        v: 1,
        event: 'orchestration:updated',
        companyId: 'company-1',
        roomId: 'room-1',
        payload: { sourceMessageId: 'msg-1', status: 'running', stage: 'before_runMainRoomFlow' },
      }),
    );

    expect(gateway.emitOrchestrationUpdated).toHaveBeenCalledWith('company-1', 'room-1', {
      sourceMessageId: 'msg-1',
      status: 'running',
      stage: 'before_runMainRoomFlow',
    });
  });

  it('should forward responder:thinking to gateway.emitResponderThinking', async () => {
    const capture: { cb?: (message: string) => void } = {};
    const fakeClient = makeFakeClient(capture);
    (createGatewayRedisClient as jest.Mock).mockReturnValue(fakeClient);

    const gateway = makeGateway();
    const sub = new CollaborationNotifySubscriber(makeConfig(), gateway as any, {} as any);
    await sub.onModuleInit();

    capture.cb!(
      JSON.stringify({
        v: 1,
        event: 'responder:thinking',
        companyId: 'company-1',
        roomId: 'room-1',
        payload: {
          sourceMessageId: 'msg-1',
          status: 'thinking',
          responderAgentIds: ['agent-1'],
          startedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    );

    expect(gateway.emitResponderThinking).toHaveBeenCalledWith('company-1', 'room-1', {
      sourceMessageId: 'msg-1',
      status: 'thinking',
      responderAgentIds: ['agent-1'],
      startedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('should forward message:metadata_updated to gateway.emitMessageMetadataUpdated', async () => {
    const capture: { cb?: (message: string) => void } = {};
    const fakeClient = makeFakeClient(capture);
    (createGatewayRedisClient as jest.Mock).mockReturnValue(fakeClient);

    const gateway = makeGateway();
    const sub = new CollaborationNotifySubscriber(makeConfig(), gateway as any, {} as any);
    await sub.onModuleInit();

    capture.cb!(
      JSON.stringify({
        v: 1,
        event: 'message:metadata_updated',
        companyId: 'company-1',
        roomId: 'room-1',
        message: { id: 'm-1', roomId: 'room-1', metadata: { ceoAlignment: { phase: 'aligning' } } },
      }),
    );

    expect(gateway.emitMessageMetadataUpdated).toHaveBeenCalledWith('company-1', 'room-1', {
      id: 'm-1',
      roomId: 'room-1',
      metadata: { ceoAlignment: { phase: 'aligning' } },
    });
  });
});

