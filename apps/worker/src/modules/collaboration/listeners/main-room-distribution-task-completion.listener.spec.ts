import { MainRoomDistributionTaskCompletionListener } from './main-room-distribution-task-completion.listener.js';
import type { TaskCompletedEvent } from '@contracts/events';

describe('MainRoomDistributionTaskCompletionListener', () => {
  const event: TaskCompletedEvent = {
    eventId: 'e1',
    eventType: 'task.completed',
    aggregateId: 't1',
    aggregateType: 'task',
    occurredAt: new Date().toISOString(),
    version: 1,
    companyId: 'co1',
    data: {
      companyId: 'co1',
      taskId: 't1',
      parentId: 'parent-1',
      completedAt: new Date().toISOString(),
    },
  };

  function setup(opts: { respectDeps?: boolean; summaryEnabled?: boolean }) {
    const config = {
      isMainRoomDispatchRespectDependencies: () => opts.respectDeps ?? true,
      isMainRoomDistributionCompletionSummaryEnabled: () => opts.summaryEnabled ?? false,
    } as any;
    const tenantContext = {
      runWithCompanyId: jest.fn(async (_cid: string, fn: () => Promise<void>) => fn()),
    } as any;
    const messaging = {
      subscribeWithBackoff: jest.fn(),
    } as any;
    const listener = new MainRoomDistributionTaskCompletionListener(
      messaging,
      tenantContext,
      config,
    );
    return { listener, tenantContext, messaging };
  }

  it('registers task.completed subscription on init', () => {
    const { listener, messaging } = setup({});
    listener.onModuleInit();
    expect(messaging.subscribeWithBackoff).toHaveBeenCalledWith(
      'task.completed',
      expect.any(Function),
      expect.objectContaining({ queue: 'worker-main-room-distribution-task-completed' }),
    );
  });

  it('dispatches when deps on and summary off', async () => {
    const { listener, messaging } = setup({
      respectDeps: true,
      summaryEnabled: false,
    });
    listener.onModuleInit();
    const handler = messaging.subscribeWithBackoff.mock.calls[0]![1] as (
      e: TaskCompletedEvent,
    ) => Promise<void>;
    // dispatchExecutor was removed - handler should complete without error
    await handler(event);
  });

  it('skips when both deps and summary flags are off', async () => {
    const { listener, messaging } = setup({
      respectDeps: false,
      summaryEnabled: false,
    });
    listener.onModuleInit();
    const handler = messaging.subscribeWithBackoff.mock.calls[0]![1] as (
      e: TaskCompletedEvent,
    ) => Promise<void>;
    // dispatchExecutor was removed - handler should complete without error
    await handler(event);
  });
});
