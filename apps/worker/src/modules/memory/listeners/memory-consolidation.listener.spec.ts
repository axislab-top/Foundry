import { of } from 'rxjs';
import { MemoryConsolidationListener } from './memory-consolidation.listener.js';

describe('MemoryConsolidationListener', () => {
  it('should exclude stream_chunk from summarize texts', async () => {
    const messaging = {
      subscribeWithBackoff: jest.fn(),
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;

    const tenantContext = {
      runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<void>) => fn()),
    } as any;

    const config = {
      isMemoryConsolidationEnabled: () => true,
      isMemoryGraphV2Enabled: () => false,
      getWorkerActorUserId: () => 'worker-admin',
      getApiRpcTimeoutMs: () => 5000,
    } as any;

    const apiRpc = {
      send: jest.fn((pattern: string, payload: any) => {
        switch (pattern) {
          case 'collaboration.messages.list': {
            const items = [
              {
                id: 'm1',
                roomId: 'room-1',
                senderType: 'human',
                messageType: 'text',
                content: 'hello',
                seq: 1,
              },
              {
                id: 'm2',
                roomId: 'room-1',
                senderType: 'agent',
                messageType: 'stream_chunk',
                content: 'streaming draft',
                seq: 2,
              },
              {
                id: 'm3',
                roomId: 'room-1',
                senderType: 'agent',
                messageType: 'system',
                content: 'final ok',
                seq: 3,
              },
            ];
            return of({ items, hasMore: false });
          }

          case 'memory.summarize': {
            // texts should contain only non-stream_chunk entries
            expect(payload?.data?.texts).toEqual(
              expect.arrayContaining(['human: hello', 'agent: final ok']),
            );
            expect(payload?.data?.texts.join('\n')).not.toContain('streaming draft');
            return of({ summary: 'ROOM SUMMARY' });
          }

          case 'collaboration.rooms.findOne':
            return of({ organizationNodeId: null });

          case 'memory.entries.store':
            return of(undefined);

          case 'memory.entry.promoted':
            return of(undefined);

          default:
            return of(undefined);
        }
      }),
    } as any;

    const monitoring = {
      incMemoryPermissionDenied: jest.fn(),
      incMemoryFallbackToCompany: jest.fn(),
    } as any;
    const listener = new MemoryConsolidationListener(messaging, tenantContext, apiRpc, config, monitoring);

    const event: any = {
      eventId: 'evt1',
      eventType: 'collaboration.memory.consolidate.requested',
      aggregateId: 'company-1',
      aggregateType: 'company',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'company-1',
      data: {
        roomId: 'room-1',
        trigger: 'unit',
        sourceMessageId: 'msg-0',
      },
    };

    await (listener as any).handle(event);

    // ensure we attempted to summarize once
    expect(apiRpc.send).toHaveBeenCalledWith(
      'memory.summarize',
      expect.objectContaining({
        companyId: 'company-1',
        data: expect.objectContaining({
          texts: expect.any(Array),
        }),
      }),
    );
  });
});

