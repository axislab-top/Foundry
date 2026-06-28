import { ConfigService } from './config.service.js';

describe('ConfigService heavy timeout defaults', () => {
  const build = (store: Record<string, unknown> = {}) => {
    const manager = {
      get<T>(key: string, defaultValue?: T): T {
        return (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : defaultValue) as T;
      },
    };
    const moduleRef = { get: () => undefined };
    return new ConfigService(manager as any, moduleRef as any);
  };

  it('uses 180s as splitting stage default timeout', () => {
    const svc = build();
    expect(svc.getSplittingStageTimeoutMs()).toBe(180_000);
  });

  it('uses 240s as heavy hybrid hard-timeout default', () => {
    const svc = build();
    expect(svc.getCeoHeavyHybridTimeoutMs()).toBe(240_000);
  });

  it('getAgentsActiveDirectoryPageSize defaults to 100 and clamps to 1–500', () => {
    expect(build({}).getAgentsActiveDirectoryPageSize()).toBe(100);
    expect(build({ AGENTS_ACTIVE_DIRECTORY_PAGE_SIZE: 200 }).getAgentsActiveDirectoryPageSize()).toBe(200);
    expect(build({ AGENTS_ACTIVE_DIRECTORY_PAGE_SIZE: 999 }).getAgentsActiveDirectoryPageSize()).toBe(500);
    expect(build({ AGENTS_ACTIVE_DIRECTORY_PAGE_SIZE: 0 }).getAgentsActiveDirectoryPageSize()).toBe(1);
  });

  it('isForceMemoryCortexOnly defaults true and respects env', () => {
    expect(build({}).isForceMemoryCortexOnly()).toBe(true);
    expect(build({ FORCE_MEMORY_CORTEX_ONLY: false }).isForceMemoryCortexOnly()).toBe(false);
  });
});
