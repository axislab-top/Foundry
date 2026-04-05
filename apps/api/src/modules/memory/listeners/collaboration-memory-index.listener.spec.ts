import { CollaborationMemoryIndexListener } from './collaboration-memory-index.listener.js';

describe('CollaborationMemoryIndexListener', () => {
  it('should skip stream_chunk and not store memory', async () => {
    const messaging = {
      subscribeWithBackoff: jest.fn(),
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;

    const tenantContext = {
      runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<void>) => fn()),
    } as any;

    const config = {
      getMemoryConsolidationWindowMessages: () => 20,
      isSessionMemoryEnabled: () => true,
      isMemoryConsolidationEnabled: () => true,
    } as any;

    const memory = {
      storeEntry: jest.fn().mockResolvedValue(undefined),
    } as any;

    const messagesRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'msg-1',
        companyId: 'company-1',
        roomId: 'room-1',
        messageType: 'stream_chunk',
        content: 'partial chunk',
        seq: '20',
        senderType: 'agent',
      }),
    } as any;

    const roomsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'room-1',
        companyId: 'company-1',
        name: 'Main',
        organizationNodeId: null,
      }),
    } as any;

    const listener = new CollaborationMemoryIndexListener(
      messaging,
      tenantContext,
      config,
      memory,
      messagesRepo,
      roomsRepo,
    );

    const event: any = {
      eventId: 'evt-1',
      eventType: 'collaboration.memory.index.requested',
      aggregateId: 'msg-1',
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'company-1',
      data: {
        messageId: 'msg-1',
        roomId: 'room-1',
        requestedAt: new Date().toISOString(),
      },
    };

    await (listener as any).handle(event);

    expect(memory.storeEntry).not.toHaveBeenCalled();
    expect(messaging.publish).not.toHaveBeenCalled();
  });
});

