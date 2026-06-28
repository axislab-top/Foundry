import { MemoryGraphRolloutService } from './memory-graph-rollout.service.js';

describe('MemoryGraphRolloutService', () => {
  it('returns false when global flag is off', async () => {
    const config = { isMemoryGraphV2Enabled: () => false } as any;
    const svc = new MemoryGraphRolloutService(config);
    await expect(svc.isMemoryGraphV2Effective('00000000-0000-4000-8000-000000000001')).resolves.toBe(false);
  });

  it('returns true when global on and companyId present (ignores rollout / heartbeat)', async () => {
    const config = { isMemoryGraphV2Enabled: () => true } as any;
    const svc = new MemoryGraphRolloutService(config);
    await expect(svc.isMemoryGraphV2Effective('00000000-0000-4000-8000-000000000002')).resolves.toBe(true);
  });

  it('returns false when companyId blank', async () => {
    const config = { isMemoryGraphV2Enabled: () => true } as any;
    const svc = new MemoryGraphRolloutService(config);
    await expect(svc.isMemoryGraphV2Effective('  ')).resolves.toBe(false);
  });
});
