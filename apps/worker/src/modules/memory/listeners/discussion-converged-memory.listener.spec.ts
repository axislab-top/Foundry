import { DiscussionConvergedMemoryListener } from './discussion-converged-memory.listener.js';

describe('DiscussionConvergedMemoryListener', () => {
  it('should publish consolidation request and trigger recap generation', async () => {
    const messaging = {
      subscribeWithBackoff: jest.fn(),
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;

    const tenantContext = {
      runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<void>) => fn()),
    } as any;

    const experienceLearner = {
      generateRecap: jest.fn().mockResolvedValue(undefined),
    } as any;

    const listener = new DiscussionConvergedMemoryListener(messaging, tenantContext, experienceLearner);

    const event: any = {
      eventId: 'evt-1',
      eventType: 'collaboration.discussion.converged',
      aggregateId: 'thread-1',
      aggregateType: 'discussion_thread',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'company-1',
      data: { roomId: 'room-1', threadId: 'thread-1', convergedAt: new Date().toISOString() },
    };

    await (listener as any).handle(event);

    expect(messaging.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'collaboration.memory.consolidate.requested',
        companyId: 'company-1',
        data: expect.objectContaining({ roomId: 'room-1', sourceMessageId: 'thread-1' }),
      }),
      expect.objectContaining({ routingKey: 'collaboration.memory.consolidate.requested' }),
    );

    expect(experienceLearner.generateRecap).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'collaboration.discussion.converged',
        companyId: 'company-1',
        data: expect.objectContaining({ threadId: 'thread-1' }),
      }),
    );
  });
});

