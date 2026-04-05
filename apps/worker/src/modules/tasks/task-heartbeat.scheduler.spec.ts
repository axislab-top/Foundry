jest.mock('../../common/config/config.service.js', () => ({
  ConfigService: class ConfigService {},
}));

import { TaskHeartbeatScheduler } from './task-heartbeat.scheduler.js';

describe('TaskHeartbeatScheduler (heartbeat)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('publishes task.heartbeat.tick on interval for registered companies', async () => {
    const published: unknown[] = [];
    const messaging: any = {
      subscribeWithBackoff: jest.fn(),
      publish: jest.fn(async (e: unknown) => {
        published.push(e);
        return true;
      }),
    };
    const config = {
      getTaskHeartbeatIntervalMs: () => 10_000,
      getTaskHeartbeatMaxCompaniesPerTick: () => 20,
    };

    const scheduler = new TaskHeartbeatScheduler(messaging, config as any);
    scheduler.registerCompanyId('company-1');
    scheduler.onModuleInit();

    expect(messaging.subscribeWithBackoff).toHaveBeenCalledWith(
      'company.created',
      expect.any(Function),
      expect.any(Object),
    );

    jest.advanceTimersByTime(10_000);
    await Promise.resolve();

    expect(messaging.publish).toHaveBeenCalled();
    const tick = published.find(
      (p: any) => p?.eventType === 'task.heartbeat.tick',
    ) as { data?: { companyId?: string } } | undefined;
    expect(tick?.data?.companyId).toBe('company-1');

    scheduler.onModuleDestroy();
  });

  it('does not publish when no companies registered', async () => {
    const messaging: any = {
      subscribeWithBackoff: jest.fn(),
      publish: jest.fn(),
    };
    const config = { getTaskHeartbeatIntervalMs: () => 5000 };
    (config as any).getTaskHeartbeatMaxCompaniesPerTick = () => 20;
    const scheduler = new TaskHeartbeatScheduler(messaging, config as any);
    scheduler.onModuleInit();
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(messaging.publish).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });
});
