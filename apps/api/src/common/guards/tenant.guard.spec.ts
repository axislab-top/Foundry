import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantGuard } from '@service/tenant';
import { IS_PUBLIC_METADATA_KEY, TENANT_REQUIRED_METADATA_KEY } from '@service/tenant';
import { createMockExecutionContext } from '../../../../test/utils/test-helpers.js';

describe('TenantGuard', () => {
  let clsService: { set: jest.Mock };
  let tenantService: { userBelongsToCompany: jest.Mock };
  let reflector: Reflector;
  let resolutionStrategy: { resolve: jest.Mock };
  let guard: TenantGuard;

  beforeEach(() => {
    clsService = { set: jest.fn() };
    tenantService = { userBelongsToCompany: jest.fn() };
    reflector = new Reflector();
    resolutionStrategy = { resolve: jest.fn() };
    guard = new TenantGuard(
      clsService as any,
      tenantService as any,
      reflector,
      resolutionStrategy as any,
    );
    delete process.env.TENANT_REQUIRED_BY_DEFAULT;
  });

  it('should allow @Public routes without companyId', async () => {
    const context = createMockExecutionContext({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({}) }),
    });
    reflector.getAllAndOverride = jest.fn((key: unknown) => {
      if (key === IS_PUBLIC_METADATA_KEY) return true;
      return undefined;
    });
    resolutionStrategy.resolve.mockReturnValue(undefined);

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
  });

  it('should reject when companyId is missing in strict mode', async () => {
    const context = createMockExecutionContext({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u-1' } }) }),
    });
    reflector.getAllAndOverride = jest.fn((key: unknown) => {
      if (key === IS_PUBLIC_METADATA_KEY) return false;
      return undefined;
    });
    resolutionStrategy.resolve.mockReturnValue(undefined);

    await expect(guard.canActivate(context as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject when user is missing', async () => {
    const context = createMockExecutionContext({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({}) }),
    });
    reflector.getAllAndOverride = jest.fn((key: unknown) => {
      if (key === IS_PUBLIC_METADATA_KEY) return false;
      if (key === TENANT_REQUIRED_METADATA_KEY) return true;
      return undefined;
    });
    resolutionStrategy.resolve.mockReturnValue('c-1');

    await expect(guard.canActivate(context as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should reject when membership check fails', async () => {
    const req: any = { user: { id: 'u-1' } };
    const context = createMockExecutionContext({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
    });
    reflector.getAllAndOverride = jest.fn((key: unknown) => {
      if (key === IS_PUBLIC_METADATA_KEY) return false;
      if (key === TENANT_REQUIRED_METADATA_KEY) return true;
      return undefined;
    });
    resolutionStrategy.resolve.mockReturnValue('c-1');
    tenantService.userBelongsToCompany.mockResolvedValue(false);

    await expect(guard.canActivate(context as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should set cls and request companyId when access is allowed', async () => {
    const req: any = { user: { id: 'u-1' } };
    const context = createMockExecutionContext({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
    });
    reflector.getAllAndOverride = jest.fn((key: unknown) => {
      if (key === IS_PUBLIC_METADATA_KEY) return false;
      if (key === TENANT_REQUIRED_METADATA_KEY) return true;
      return undefined;
    });
    resolutionStrategy.resolve.mockReturnValue('c-1');
    tenantService.userBelongsToCompany.mockResolvedValue(true);

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
    expect(clsService.set).toHaveBeenCalledWith('tenant.companyId', 'c-1');
    expect(req.companyId).toBe('c-1');
  });

  it('should reject rpc request when companyId is missing', async () => {
    const context = createMockExecutionContext({
      getType: () => 'rpc',
      switchToRpc: () => ({ getData: () => ({ actor: { id: 'u-1' } }) }),
    });
    await expect(guard.canActivate(context as any)).rejects.toThrow(BadRequestException);
  });

  it('should reject rpc request when actor id is missing', async () => {
    const context = createMockExecutionContext({
      getType: () => 'rpc',
      switchToRpc: () => ({ getData: () => ({ companyId: 'c-1' }) }),
    });
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject rpc request when membership check fails', async () => {
    tenantService.userBelongsToCompany.mockResolvedValue(false);
    const context = createMockExecutionContext({
      getType: () => 'rpc',
      switchToRpc: () => ({ getData: () => ({ actor: { id: 'u-1' }, companyId: 'c-1' }) }),
    });
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should allow rpc request and set cls companyId when membership passes', async () => {
    tenantService.userBelongsToCompany.mockResolvedValue(true);
    const context = createMockExecutionContext({
      getType: () => 'rpc',
      switchToRpc: () => ({ getData: () => ({ actor: { id: 'u-1' }, companyId: 'c-1' }) }),
    });
    await expect(guard.canActivate(context as any)).resolves.toBe(true);
    expect(clsService.set).toHaveBeenCalledWith('tenant.companyId', 'c-1');
  });

  it('should still skip unsupported non-http/non-rpc contexts', async () => {
    const context = createMockExecutionContext({
      getType: () => 'ws',
    });
    await expect(guard.canActivate(context as any)).resolves.toBe(true);
  });

  it('should allow missing companyId when strict mode disabled globally', async () => {
    process.env.TENANT_REQUIRED_BY_DEFAULT = 'false';
    const context = createMockExecutionContext({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u-1' } }) }),
    });
    reflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);
    resolutionStrategy.resolve.mockReturnValue(undefined);

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
  });
});
