import { of } from 'rxjs';
import { SupervisorRetrospectiveListener } from './supervisor-retrospective.listener.js';

describe('SupervisorRetrospectiveListener', () => {
  it('aggregates daily/weekly retrospective to memory once per period', async () => {
    const messaging = { subscribeWithBackoff: jest.fn() } as any;
    const config = {
      getWorkerActorUserId: () => 'worker-user',
      getApiRpcTimeoutMs: () => 3000,
      isSupervisorReviewChatSummaryEnabled: () => false,
    } as any;
    const idempotency = { markIfNew: jest.fn().mockReturnValue(true) } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'companies.heartbeat.getConfig') return of({ enabled: true, frequency: 'daily' });
        if (pattern === 'supervisor.metrics.retrospective') return of({ totals: { reviews: 12 } });
        if (pattern === 'memory.entries.store') return of({ id: 'mem-1' });
        return of({});
      }),
    } as any;
    const listener = new SupervisorRetrospectiveListener(messaging, config, idempotency, apiRpc);
    await (listener as any).handle({
      data: { companyId: 'c1', tickAt: '2026-04-07T00:00:00.000Z' },
    });
    expect(apiRpc.send).toHaveBeenCalledWith(
      'memory.entries.store',
      expect.objectContaining({
        data: expect.objectContaining({
          collectionLabel: expect.stringContaining('supervisor_retrospective:daily:'),
        }),
      }),
    );
  });

  it('pushes chat summary when enabled', async () => {
    const messaging = { subscribeWithBackoff: jest.fn() } as any;
    const config = {
      getWorkerActorUserId: () => 'worker-user',
      getApiRpcTimeoutMs: () => 3000,
      isSupervisorReviewChatSummaryEnabled: () => true,
    } as any;
    const idempotency = { markIfNew: jest.fn().mockReturnValue(true) } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'companies.heartbeat.getConfig') return of({ enabled: true, frequency: 'weekly' });
        if (pattern === 'supervisor.metrics.retrospective') return of({ overview: '本周风险下降，执行质量提升。' });
        if (pattern === 'memory.entries.store') return of({ id: 'mem-1' });
        if (pattern === 'collaboration.rooms.findMain') return of({ id: 'room-main' });
        if (pattern === 'agents.findAll') return of({ items: [{ id: 'ceo-1' }] });
        if (pattern === 'collaboration.messages.appendAgent') return of({});
        return of({});
      }),
    } as any;
    const listener = new SupervisorRetrospectiveListener(messaging, config, idempotency, apiRpc);
    await (listener as any).handle({
      data: { companyId: 'c1', tickAt: '2026-04-07T00:00:00.000Z' },
    });
    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.messages.appendAgent',
      expect.objectContaining({
        roomId: 'room-main',
        metadata: expect.objectContaining({ supervisorRetrospectiveSummary: true }),
      }),
    );
  });
});

