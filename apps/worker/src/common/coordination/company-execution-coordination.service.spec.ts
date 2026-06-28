import { CompanyExecutionCoordinationService } from './company-execution-coordination.service.js';
import { ResiliencePolicyService } from '../resilience/resilience-policy.service.js';

describe('CompanyExecutionCoordinationService', () => {
  const monitoring = {
    incCoordinationRedisFallback: jest.fn(),
    incCeoGraphLockContention: jest.fn(),
  };

  it('uses memory heartbeat lock when redis disabled', async () => {
    const config = {
      isCompanyExecutionCoordinationRedisEnabled: () => false,
      getRedisUrl: () => undefined,
      isWorkerMultiInstanceStrict: () => false,
      getCeoHeartbeatLockTtlMs: () => 60_000,
      getCeoGraphLockTtlMs: () => 60_000,
      getHeartbeatInteractiveCooldownMs: () => 20_000,
      getHeartbeatMinIntervalMs: () => 0,
      getRedisKeyPrefix: () => '',
      getAutonomousCooldownTaskCompletedMs: () => 60_000,
      getAutonomousCooldownBudgetWarningMs: () => 60_000,
    };
    const redis = { setNxPx: jest.fn(), setPx: jest.fn(), get: jest.fn(), delIfValueMatches: jest.fn() };
    const svc = new CompanyExecutionCoordinationService(
      config as any,
      redis as any,
      new ResiliencePolicyService(),
      monitoring as any,
    );
    const a = await svc.tryAcquireHeartbeatLock('c1');
    expect(a.acquired).toBe(true);
    const b = await svc.tryAcquireHeartbeatLock('c1');
    expect(b.acquired).toBe(false);
    await svc.releaseHeartbeatLock('c1', a.token);
    const c = await svc.tryAcquireHeartbeatLock('c1');
    expect(c.acquired).toBe(true);
  });
});
