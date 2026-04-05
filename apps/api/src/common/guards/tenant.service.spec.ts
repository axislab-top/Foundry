import { TenantService } from '@service/tenant';

describe('TenantService', () => {
  afterEach(() => {
    delete process.env.TENANT_MEMBERSHIP_ENFORCED;
  });

  it('should return true in compatibility mode', async () => {
    process.env.TENANT_MEMBERSHIP_ENFORCED = 'false';
    const service = new TenantService(undefined as any);
    await expect(service.userBelongsToCompany('u-1', 'c-1')).resolves.toBe(true);
  });

  it('should compat-allow in strict mode when datasource is missing (logged warning)', async () => {
    process.env.TENANT_MEMBERSHIP_ENFORCED = 'true';
    const service = new TenantService(undefined as any);
    // TenantService 在 strict 下若 DataSource 未注入，为避免阻断向导/本地开发，暂时放行并打 WARN。
    await expect(service.userBelongsToCompany('u-1', 'c-1')).resolves.toBe(true);
  });

  it('should validate membership in strict mode', async () => {
    process.env.TENANT_MEMBERSHIP_ENFORCED = 'true';
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ ok: 1 }]) // membership query
        .mockResolvedValueOnce([]), // owner fallback
    };
    const service = new TenantService(dataSource as any);

    await expect(service.userBelongsToCompany('u-1', 'c-1')).resolves.toBe(true);
    expect(dataSource.query).toHaveBeenCalled();
  });

  it('should fallback to owner relation in strict mode', async () => {
    process.env.TENANT_MEMBERSHIP_ENFORCED = 'true';
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([]) // membership query
        .mockResolvedValueOnce([{ ok: 1 }]), // owner fallback
    };
    const service = new TenantService(dataSource as any);

    await expect(service.userBelongsToCompany('u-1', 'c-1')).resolves.toBe(true);
  });
});
