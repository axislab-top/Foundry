import { TaskHeartbeatTickListener } from './task-heartbeat-tick.listener.js';

describe('TaskHeartbeatTickListener', () => {
  const buildCoordination = (overrides?: Partial<Record<string, unknown>>) => ({
    shouldSkipHeartbeatForInteractiveCooldownAsync: jest.fn(async () => ({ skip: false })),
    shouldSkipHeartbeatForMinIntervalAsync: jest.fn(async () => ({ skip: false })),
    tryAcquireHeartbeatLock: jest.fn(async () => ({ acquired: true, token: 't1' })),
    releaseHeartbeatLock: jest.fn(async () => undefined),
    recordHeartbeatRunAt: jest.fn(async () => undefined),
    markInteractiveActivity: jest.fn(async () => undefined),
    ...overrides,
  });

  it('skips concurrent tick when heartbeat lock not acquired', async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });

    const messaging = { subscribeWithBackoff: jest.fn(), publish: jest.fn() } as any;
    const companyOrchestrator = {
      runHeartbeat: jest.fn(async () => blocker),
    } as any;
    const config = {
      getHeartbeatInteractiveCooldownMs: jest.fn(() => 20_000),
      isHeartbeatTickRethrowOnFailure: jest.fn(() => false),
    } as any;
    const collaborationSessionLease = {
      isHeavyCollaborationLeaseActive: jest.fn(async () => false),
    } as any;

    let lockHeld = false;
    const coordination = buildCoordination({
      tryAcquireHeartbeatLock: jest.fn(async () => {
        if (lockHeld) return { acquired: false, token: '' };
        lockHeld = true;
        return { acquired: true, token: 't1' };
      }),
      releaseHeartbeatLock: jest.fn(async () => {
        lockHeld = false;
      }),
    });

    const listener = new TaskHeartbeatTickListener(
      messaging,
      companyOrchestrator,
      config,
      collaborationSessionLease,
      coordination as any,
    );
    const evt = {
      data: { companyId: 'c1', tickAt: '2026-01-01T00:00:00.000Z' },
    } as any;

    const p1 = (listener as any).handle(evt);
    const p2 = (listener as any).handle(evt);
    await Promise.resolve();

    expect(companyOrchestrator.runHeartbeat).toHaveBeenCalledTimes(1);

    release();
    await Promise.all([p1, p2]);
  });

  it('delays heartbeat when recent human interactive activity exists', async () => {
    const messaging = { subscribeWithBackoff: jest.fn(), publish: jest.fn() } as any;
    const companyOrchestrator = {
      runHeartbeat: jest.fn(async () => undefined),
    } as any;
    const config = {
      getHeartbeatInteractiveCooldownMs: jest.fn(() => 60_000),
      isHeartbeatTickRethrowOnFailure: jest.fn(() => false),
    } as any;
    const collaborationSessionLease = {
      isHeavyCollaborationLeaseActive: jest.fn(async () => false),
    } as any;
    const coordination = buildCoordination({
      shouldSkipHeartbeatForInteractiveCooldownAsync: jest.fn(async () => ({
        skip: true,
        sinceInteractiveMs: 1000,
      })),
    });
    const listener = new TaskHeartbeatTickListener(
      messaging,
      companyOrchestrator,
      config,
      collaborationSessionLease,
      coordination as any,
    );
    await (listener as any).handle({
      data: { companyId: 'c1', tickAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(companyOrchestrator.runHeartbeat).not.toHaveBeenCalled();
  });

  it('skips heartbeat when heavy collaboration lease is active', async () => {
    const messaging = { subscribeWithBackoff: jest.fn(), publish: jest.fn() } as any;
    const companyOrchestrator = {
      runHeartbeat: jest.fn(async () => undefined),
    } as any;
    const config = {
      getHeartbeatInteractiveCooldownMs: jest.fn(() => 20_000),
      isHeartbeatTickRethrowOnFailure: jest.fn(() => false),
    } as any;
    const collaborationSessionLease = {
      isHeavyCollaborationLeaseActive: jest.fn(async () => true),
    } as any;
    const coordination = buildCoordination();
    const listener = new TaskHeartbeatTickListener(
      messaging,
      companyOrchestrator,
      config,
      collaborationSessionLease,
      coordination as any,
    );
    await (listener as any).handle({
      data: { companyId: 'c1', tickAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(companyOrchestrator.runHeartbeat).not.toHaveBeenCalled();
    expect(collaborationSessionLease.isHeavyCollaborationLeaseActive).toHaveBeenCalledWith('c1');
  });
});
