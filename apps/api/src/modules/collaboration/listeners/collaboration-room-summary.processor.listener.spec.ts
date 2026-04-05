import { CollaborationRoomSummaryProcessorListener } from './collaboration-room-summary.processor.listener.js';

describe('CollaborationRoomSummaryProcessorListener', () => {
  it('should exclude stream_chunk from room summary inputs', async () => {
    const messaging = {
      subscribeWithBackoff: jest.fn(),
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;

    const tenantContext = {
      runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<void>) => fn()),
    } as any;

    const summarizer = {
      summarize: jest.fn(async ({ texts }: any) => {
        // Should not include any stream_chunk-derived line content
        const joined = (texts as string[]).join('\n');
        expect(joined).not.toContain('streaming draft');
        return { summary: 'ROOM SUMMARY' };
      }),
    } as any;

    const messagesRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'm1',
          roomId: 'room-1',
          companyId: 'company-1',
          senderType: 'human',
          messageType: 'text',
          content: 'hello',
        },
        {
          id: 'm2',
          roomId: 'room-1',
          companyId: 'company-1',
          senderType: 'agent',
          messageType: 'stream_chunk',
          content: 'streaming draft',
        },
      ]),
    } as any;

    const listener = new CollaborationRoomSummaryProcessorListener(
      messaging,
      tenantContext,
      summarizer,
      messagesRepo,
    );

    const event: any = {
      eventId: 'evt1',
      eventType: 'collaboration.room.summary.requested',
      aggregateId: 'room-1',
      aggregateType: 'chat_room',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'company-1',
      data: {
        roomId: 'room-1',
        mode: 'latest',
      },
    };

    await (listener as any).handle(event);

    expect(summarizer.summarize).toHaveBeenCalledTimes(1);
    expect(messaging.publish).toHaveBeenCalledTimes(1);

    const [published] = messaging.publish.mock.calls[0] as [any];
    expect(published.eventType).toBe('collaboration.room.summary.generated');
    expect(published.data.summary).toBe('ROOM SUMMARY');
    expect(published.data.messageCount).toBe(1); // only 'text' contributes
  });
});

