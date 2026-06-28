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

  it('should fail-close in strict mode when datasource is missing', async () => {
    process.env.TENANT_MEMBERSHIP_ENFORCED = 'true';
    const service = new TenantService(undefined as any);
    await expect(service.userBelongsToCompany('u-1', 'c-1')).resolves.toBe(false);
  });

  it('should fail-close in strict mode when datasource is uninitialized', async () => {
    process.env.TENANT_MEMBERSHIP_ENFORCED = 'true';
    const service = new TenantService({ isInitialized: false } as any);
    await expect(service.userBelongsToCompany('u-1', 'c-1')).resolves.toBe(false);
  });

  it('should fail-close when strict mode query throws', async () => {
    process.env.TENANT_MEMBERSHIP_ENFORCED = 'true';
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const service = new TenantService(dataSource as any);
    await expect(service.userBelongsToCompany('u-1', 'c-1')).resolves.toBe(false);
  });

  it('should validate membership in strict mode', async () => {
    process.env.TENANT_MEMBERSHIP_ENFORCED = 'true';
    const dataSource = {
      isInitialized: true,
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
      isInitialized: true,
      query: jest
        .fn()
        .mockResolvedValueOnce([]) // membership query
        .mockResolvedValueOnce([{ ok: 1 }]), // owner fallback
    };
    const service = new TenantService(dataSource as any);

    await expect(service.userBelongsToCompany('u-1', 'c-1')).resolves.toBe(true);
  });

  it('reports membership backend health from datasource state', () => {
    expect(new TenantService(undefined as any).isMembershipBackendHealthy()).toBe(false);
    expect(new TenantService({ isInitialized: false } as any).isMembershipBackendHealthy()).toBe(
      false,
    );
    expect(new TenantService({ isInitialized: true } as any).isMembershipBackendHealthy()).toBe(
      true,
    );
  });
});
