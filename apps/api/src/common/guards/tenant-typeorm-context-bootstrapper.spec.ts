import {
  SQL_SET_SESSION_CURRENT_TENANT,
  TenantTypeormContextBootstrapper,
} from '@service/tenant';

describe('TenantTypeormContextBootstrapper', () => {
  it('should patch queryRunner.connect and set tenant session variable', async () => {
    const queryRunner: any = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
    };

    const dataSource: any = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };

    const tenantContext = {
      getCompanyId: jest.fn().mockReturnValue('company-1'),
    };

    const bootstrapper = new TenantTypeormContextBootstrapper(
      dataSource,
      tenantContext as any,
    );
    bootstrapper.onModuleInit();

    const patched = dataSource.createQueryRunner();
    await patched.connect();

    expect(queryRunner.query).toHaveBeenCalledWith(
      SQL_SET_SESSION_CURRENT_TENANT,
      ['company-1'],
    );
  });

  it('should not set tenant when CLS has no company id', async () => {
    const queryRunner: any = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
    };

    const dataSource: any = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };

    const tenantContext = {
      getCompanyId: jest.fn().mockReturnValue(undefined),
    };

    const bootstrapper = new TenantTypeormContextBootstrapper(
      dataSource,
      tenantContext as any,
    );
    bootstrapper.onModuleInit();

    const patched = dataSource.createQueryRunner();
    await patched.connect();

    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
