import type { CollaborationReplayDelegateCompletedEvent } from '@contracts/events';
import { MainRoomReplayDelegateCompletedListener } from './main-room-replay-delegate-completed.listener.js';

function event(
  overrides: Partial<CollaborationReplayDelegateCompletedEvent['data']> = {},
): CollaborationReplayDelegateCompletedEvent {
  return {
    eventId: 'evt-1',
    eventType: 'collaboration.replay.delegate.completed',
    aggregateId: 'm1',
    aggregateType: 'chat_message',
    occurredAt: new Date().toISOString(),
    version: 1,
    companyId: 'company-1',
    data: {
      messageId: 'm1',
      roomId: 'room-main',
      traceId: 'trace-1',
      authorizationOutcome: 'authorized',
      replayDecisionKind: 'confirm_execution',
      requiresUserConfirmation: false,
      targetDepartmentSlugs: [],
      targetAgentIds: [],
      summary: 'authorized',
      rationale: ['worker_replay_ssot'],
      completedAt: new Date().toISOString(),
      ...overrides,
    },
  };
}

describe('MainRoomReplayDelegateCompletedListener', () => {
  it('subscribes to collaboration.replay.delegate.completed on init', () => {
    const messaging = { subscribeWithBackoff: jest.fn() };
    const listener = new MainRoomReplayDelegateCompletedListener(
      messaging as never,
      { runWithCompanyId: jest.fn() } as never,
      { ingest: jest.fn() } as never,
    );

    listener.onModuleInit();

    expect(messaging.subscribeWithBackoff).toHaveBeenCalledWith(
      'collaboration.replay.delegate.completed',
      expect.any(Function),
      expect.objectContaining({ queue: 'api-main-room-replay-delegate-completed', durable: true }),
    );
  });

  it('runs ingest inside tenant context for valid events', async () => {
    const ingest = { ingest: jest.fn(async () => undefined) };
    const tenantContext = {
      runWithCompanyId: jest.fn(async (companyId: string, fn: () => Promise<void>) => {
        expect(companyId).toBe('company-1');
        await fn();
      }),
    };
    const listener = new MainRoomReplayDelegateCompletedListener(
      { subscribeWithBackoff: jest.fn() } as never,
      tenantContext as never,
      ingest as never,
    );

    await (listener as any).handle(event());

    expect(tenantContext.runWithCompanyId).toHaveBeenCalledWith('company-1', expect.any(Function));
    expect(ingest.ingest).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-1' }));
  });

  it('skips ingest when companyId is missing', async () => {
    const ingest = { ingest: jest.fn() };
    const listener = new MainRoomReplayDelegateCompletedListener(
      { subscribeWithBackoff: jest.fn() } as never,
      { runWithCompanyId: jest.fn() } as never,
      ingest as never,
    );

    await (listener as any).handle({ ...event(), companyId: '' });

    expect(ingest.ingest).not.toHaveBeenCalled();
  });

  it('rethrows ingest failures for broker retry', async () => {
    const ingest = { ingest: jest.fn(async () => { throw new Error('db down'); }) };
    const listener = new MainRoomReplayDelegateCompletedListener(
      { subscribeWithBackoff: jest.fn() } as never,
      {
        runWithCompanyId: jest.fn(async (_c: string, fn: () => Promise<void>) => fn()),
      } as never,
      ingest as never,
    );

    await expect((listener as any).handle(event())).rejects.toThrow('db down');
  });
});
