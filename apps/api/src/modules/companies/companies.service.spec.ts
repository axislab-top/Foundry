import { BadRequestException, ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
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
      runWithCompanyId: jest.fn((_companyId: string, cb: () => Promise<unknown>) => cb()),
    };
    const collaborationBootstrap: any = {
      ensureMainRoomConvergedForCompany: jest.fn().mockResolvedValue(undefined),
    };
    const creationQuota: any = {
      assertCanCreateCompany: jest.fn().mockResolvedValue(undefined),
      assertCanCreateCompanyInTransaction: jest.fn().mockResolvedValue(undefined),
    };
    const llmKeysService: any = {};
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
      query: jest.fn().mockResolvedValue([]),
    };
    const organizationInitializer: any = {
      initializeForCompany: jest.fn().mockResolvedValue(undefined),
    };
    const skillRuntimeResolver: any = {
      getResolvedCeoTemplateForWorker: jest.fn().mockResolvedValue({}),
    };
    const marketplaceAgentsRepo: any = {
      find: jest.fn().mockResolvedValue([]),
    };
    const agentsRepo: any = {
      findOne: jest.fn(),
    };
    const ceoLayerConfigService: any = {
      getStoredLayerConfig: jest.fn(),
      saveLayerConfig: jest.fn(),
      syncStoredLayerConfigToCeoAgent: jest.fn(),
      atomicEnsureAndSync: jest.fn(),
      syncLayerConfigToCeoAgent: jest.fn(),
      applyPlatformIntentLayerGlobalSettingsToCompany: jest.fn().mockResolvedValue(undefined),
    };
    const runtimePreference: any = {
      getCeoGovernancePolicy: jest.fn().mockResolvedValue({
        version: 'v1',
        requireApprovalForHighRiskChanges: true,
        defaults: {},
        roomOverrides: {},
        roleOverrides: {},
      }),
      upsertCeoGovernancePolicy: jest.fn(),
    };
    const approvalService: any = {
      create: jest.fn(),
    };
    const policyAudit: any = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    const heartbeatConfigRepo: any = {
      findOne: jest.fn(),
      create: jest.fn((x: unknown) => x),
      save: jest.fn(async (x: unknown) => x),
    };

    dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
      const manager: any = {
        query: jest.fn().mockResolvedValue(undefined),
        getRepository: jest.fn((entity: { name?: string }) =>
          entity?.name === 'Company' ? companyRepo : membershipRepo,
        ),
      };
      return fn(manager);
    });

    const service = new CompaniesService(
      dataSource,
      companyRepo,
      membershipRepo,
      heartbeatConfigRepo,
      marketplaceAgentsRepo,
      agentsRepo,
      cacheService,
      messagingService,
      tenantContext,
      organizationInitializer,
      skillRuntimeResolver,
      ceoLayerConfigService,
      runtimePreference,
      approvalService,
      policyAudit,
      collaborationBootstrap,
      llmKeysService,
      creationQuota,
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
      heartbeatConfigRepo,
      skillRuntimeResolver,
      agentsRepo,
      ceoLayerConfigService,
      runtimePreference,
      approvalService,
      policyAudit,
      collaborationBootstrap,
      llmKeysService,
      creationQuota,
    };
  };

  it('should create company and publish company.created event', async () => {
    const {
      service,
      companyRepo,
      messagingService,
      organizationInitializer,
      collaborationBootstrap,
    } = buildService();

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
    expect(collaborationBootstrap.ensureMainRoomConvergedForCompany).toHaveBeenCalledWith(
      'company-1',
      'user-1',
      'Acme',
    );
    const bootstrapOrder =
      collaborationBootstrap.ensureMainRoomConvergedForCompany.mock.invocationCallOrder[0];
    const publishOrder = messagingService.publish.mock.invocationCallOrder[0];
    expect(bootstrapOrder).toBeLessThan(publishOrder);
    expect(messagingService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'company.created',
        aggregateType: 'company',
      }),
      expect.objectContaining({ routingKey: 'company.created' }),
    );
    // `OrganizationInitializerService.initializeForCompany` 同步调用 `AgentsBootstrapService`，
    // CEO 三层见 `架构.md`§2.0（`atomicInitializeCeoLayers` + `company_ceo_layer_configs`）。
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

  it('should fail create when organization initialization cannot resolve department heads', async () => {
    const { service, companyRepo, organizationInitializer } = buildService();

    companyRepo.findOne.mockResolvedValue({
      id: 'company-1',
      name: 'Acme',
      slug: 'acme',
      industry: 'tech',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    organizationInitializer.initializeForCompany.mockRejectedValue(
      new UnprocessableEntityException('部门「市场部」无可用主管 Agent'),
    );

    await expect(
      service.create({ name: 'Acme', industry: 'tech' }, { id: 'user-1', roles: [] }),
    ).rejects.toThrow(UnprocessableEntityException);
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
      createdBy: 'other-user',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    cacheService.get.mockResolvedValue(null);

    await expect(
      service.update('company-1', { name: 'New Name' }, { id: 'user-1', roles: [] }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should create approval for high-risk governance policy patch', async () => {
    const { service, approvalService, runtimePreference } = buildService();
    approvalService.create.mockResolvedValue({ id: 'approval-1' });
    runtimePreference.getCeoGovernancePolicy.mockResolvedValue({
      version: 'v1',
      requireApprovalForHighRiskChanges: true,
      defaults: { allowRoleSpeakerWithoutProfile: true },
      roomOverrides: {},
      roleOverrides: {},
    });
    const out = await service.updateCeoGovernancePolicy(
      'company-1',
      {
        defaults: { allowRoleSpeakerWithoutProfile: false },
        changeReason: 'tighten safety',
      } as any,
      { id: 'owner-1', roles: ['admin'] },
    );
    expect(out.pendingApproval).toBe(true);
    expect(out.approvalRequestId).toBe('approval-1');
    expect(approvalService.create).toHaveBeenCalledTimes(1);
  });
});
