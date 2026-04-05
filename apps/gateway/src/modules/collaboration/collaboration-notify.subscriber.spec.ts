jest.mock('../../common/redis/gateway-redis-client.js', () => ({
  createGatewayRedisClient: jest.fn(),
}));

import { createGatewayRedisClient } from '../../common/redis/gateway-redis-client.js';
import { CollaborationNotifySubscriber } from './collaboration-notify.subscriber.js';

describe('CollaborationNotifySubscriber', () => {
  it('should forward message:chunk to gateway.emitMessageChunk', async () => {
    let subscribedCallback: ((message: string) => void) | undefined;
    const fakeClient = {
      isOpen: true,
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockImplementation((_channel: string, cb: any) => {
        subscribedCallback = cb;
      }),
      quit: jest.fn().mockResolvedValue(undefined),
    };

    (createGatewayRedisClient as jest.Mock).mockReturnValue(fakeClient);

    const config: any = {
      isCollaborationRedisNotifyEnabled: () => true,
      getRedisConfig: () => ({ host: 'localhost', port: 6379, db: 0 }),
    };

    const gateway = {
      emitMessageChunk: jest.fn(),
      broadcastMessageNew: jest.fn(),
      emitApprovalNeeded: jest.fn(),
      emitTaskProgress: jest.fn(),
      emitOrgStructureChanged: jest.fn(),
      emitTaskProgressForRoom: jest.fn(),
    };

    const adminNotify = {};

    const sub = new CollaborationNotifySubscriber(config, gateway as any, adminNotify as any);
    await sub.onModuleInit();

    expect(subscribedCallback).toBeDefined();
    subscribedCallback!(
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
    let subscribedCallback: ((message: string) => void) | undefined;
    const fakeClient = {
      isOpen: true,
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockImplementation((_channel: string, cb: any) => {
        subscribedCallback = cb;
      }),
      quit: jest.fn().mockResolvedValue(undefined),
    };

    (createGatewayRedisClient as jest.Mock).mockReturnValue(fakeClient);

    const config: any = {
      isCollaborationRedisNotifyEnabled: () => true,
      getRedisConfig: () => ({ host: 'localhost', port: 6379, db: 0 }),
    };

    const gateway = {
      emitMessageChunk: jest.fn(),
      broadcastMessageNew: jest.fn(),
      emitApprovalNeeded: jest.fn(),
      emitTaskProgress: jest.fn(),
      emitOrgStructureChanged: jest.fn(),
      emitTaskProgressForRoom: jest.fn(),
    };

    const adminNotify = {};

    const sub = new CollaborationNotifySubscriber(config, gateway as any, adminNotify as any);
    await sub.onModuleInit();

    expect(subscribedCallback).toBeDefined();
    subscribedCallback!(
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
});

