import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CompaniesService } from './companies.service.js';

describe('CompaniesService', () => {
  const buildService = () => {
    const companyRepo: any = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      save: jest.fn(),
    };
    const membershipRepo: any = {
      findOne: jest.fn(),
    };
    const cacheService: any = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };
    const messagingService: any = {
      publish: jest.fn(),
    };
    const tenantContext: any = {
      getCompanyId: jest.fn(),
    };
    const queryRunner: any = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };
    const dataSource: any = {
      createQueryRunner: jest.fn(() => queryRunner),
      transaction: jest.fn(),
    };
    const organizationInitializer: any = {
      initializeForCompany: jest.fn().mockResolvedValue(undefined),
    };
    const marketplaceAgentsRepo: any = {
      find: jest.fn().mockResolvedValue([]),
    };

    const service = new CompaniesService(
      dataSource,
      companyRepo,
      membershipRepo,
      marketplaceAgentsRepo,
      cacheService,
      messagingService,
      tenantContext,
      organizationInitializer,
    );

    return {
      service,
      companyRepo,
      membershipRepo,
      marketplaceAgentsRepo,
      cacheService,
      messagingService,
      tenantContext,
      queryRunner,
      dataSource,
      organizationInitializer,
    };
  };

  it('should create company and publish company.created event', async () => {
    const { service, companyRepo, messagingService, organizationInitializer } = buildService();

    companyRepo.findOne.mockResolvedValue({
      id: 'company-1',
      name: 'Acme',
      slug: 'acme',
      industry: 'tech',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.create(
      { name: 'Acme', industry: 'tech' },
      { id: 'user-1', roles: [] },
    );

    expect(result.id).toBe('company-1');
    expect(organizationInitializer.initializeForCompany).toHaveBeenCalledWith(
      'company-1',
      'tech',
      undefined,
      undefined,
    );
    expect(messagingService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'company.created',
        aggregateType: 'company',
      }),
      expect.objectContaining({ routingKey: 'company.created' }),
    );
  });

  it('should run membership-scoped transaction when tenant context missing', async () => {
    const { service, tenantContext, dataSource } = buildService();
    tenantContext.getCompanyId.mockReturnValue(undefined);

    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const manager: any = {
      query: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    dataSource.transaction.mockImplementation((fn: (m: unknown) => Promise<unknown>) =>
      fn(manager),
    );

    const result = await service.findAll({ page: 1, pageSize: 10 }, { id: 'user-1' });
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('should throw conflict when slug unique constraint fails too many times', async () => {
    const { service, queryRunner } = buildService();
    queryRunner.query.mockRejectedValue({ code: '23505' });

    await expect(
      service.create({ name: 'Acme' }, { id: 'user-1', roles: [] }),
    ).rejects.toThrow(ConflictException);
  });

  it('should reject create when department placement references unknown marketplace slug', async () => {
    const { service, marketplaceAgentsRepo } = buildService();
    marketplaceAgentsRepo.find.mockResolvedValue([]);

    await expect(
      service.create(
        {
          name: 'Acme',
          departmentPlacements: [
            { name: '销售部', headAgentSlug: 'no-such-agent', memberAgentSlugs: [] },
          ],
        },
        { id: 'user-1', roles: [] },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(marketplaceAgentsRepo.find).toHaveBeenCalled();
  });

  it('should reject create when department member slug is ceo', async () => {
    const { service } = buildService();

    await expect(
      service.create(
        {
          name: 'Acme',
          departmentPlacements: [{ name: '财务部', headAgentSlug: null, memberAgentSlugs: ['ceo'] }],
        },
        { id: 'user-1', roles: [] },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject update when actor is not owner/admin', async () => {
    const { service, companyRepo, membershipRepo, cacheService } = buildService();
    membershipRepo.findOne.mockResolvedValue({
      companyId: 'company-1',
      userId: 'user-1',
      role: 'member',
      isActive: true,
    });
    companyRepo.findOne.mockResolvedValue({
      id: 'company-1',
      name: 'Acme',
      slug: 'acme',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    cacheService.get.mockResolvedValue(null);

    await expect(
      service.update('company-1', { name: 'New Name' }, { id: 'user-1', roles: [] }),
    ).rejects.toThrow(ForbiddenException);
  });
});
