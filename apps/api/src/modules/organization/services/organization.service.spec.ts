import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrganizationService } from './organization.service.js';

describe('OrganizationService', () => {
  const buildService = () => {
    const dataSource: any = {
      transaction: jest.fn(async (cb: any) =>
        cb({
          createQueryBuilder: () => ({
            setLock: () => ({
              where: () => ({
                getOne: jest.fn(),
              }),
            }),
          }),
          save: jest.fn(async (x: any) => x),
          getRepository: jest.fn(() => nodesRepo),
        }),
      ),
    };
    const nodesRepo: any = {
      findOne: jest.fn(),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
      remove: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const tenantContext: any = { getCompanyId: jest.fn(() => 'company-1') };
    const cacheService: any = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      increment: jest.fn(),
      expire: jest.fn(),
    };
    const messagingService: any = { publish: jest.fn() };
    const treeService: any = { buildTree: jest.fn((n: any[]) => n) };
    const auditRepo: any = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
      createQueryBuilder: jest.fn(),
    };
    const membershipsRepo: any = {
      findOne: jest.fn().mockResolvedValue({
        companyId: 'company-1',
        userId: 'user-1',
        role: 'owner',
        isActive: true,
      }),
    };

    const service = new OrganizationService(
      dataSource,
      nodesRepo,
      auditRepo,
      membershipsRepo,
      tenantContext,
      cacheService,
      messagingService,
      treeService,
    );

    return { service, nodesRepo, cacheService, tenantContext, dataSource, auditRepo, membershipsRepo };
  };

  it('should reject update when node parent is itself', async () => {
    const { service, nodesRepo } = buildService();
    nodesRepo.findOne.mockResolvedValue({
      id: 'node-1',
      companyId: 'company-1',
      parentId: null,
      order: 0,
      type: 'department',
      name: 'Dept',
      description: null,
      agentId: null,
      metadata: null,
    });

    await expect(
      service.updateNode('node-1', { parentId: 'node-1' }, { id: 'user-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject delete when node has children', async () => {
    const { service, nodesRepo } = buildService();
    nodesRepo.findOne.mockResolvedValue({
      id: 'node-1',
      companyId: 'company-1',
      parentId: null,
      order: 0,
      type: 'department',
      name: 'Dept',
      description: null,
      agentId: null,
      metadata: null,
    });
    nodesRepo.count.mockResolvedValue(1);

    await expect(service.removeNode('node-1', { id: 'user-1' })).rejects.toThrow(BadRequestException);
  });

  it('should reject update when new parent is a descendant (deep cycle)', async () => {
    const { service, nodesRepo } = buildService();
    const map: Record<string, any> = {
      A: { id: 'A', companyId: 'company-1', parentId: null, order: 0, type: 'ceo', name: 'A' },
      B: { id: 'B', companyId: 'company-1', parentId: 'A', order: 0, type: 'department', name: 'B' },
      C: { id: 'C', companyId: 'company-1', parentId: 'B', order: 0, type: 'agent', name: 'C' },
    };
    nodesRepo.findOne.mockImplementation(async ({ where }: any) => map[where.id] || null);

    await expect(service.updateNode('A', { parentId: 'C' }, { id: 'user-1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should use company-scoped cache key for tree query', async () => {
    const { service, nodesRepo, cacheService } = buildService();
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    nodesRepo.createQueryBuilder.mockReturnValue(qb);
    cacheService.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await service.getTree({});

    const keyArg = cacheService.get.mock.calls[1][0] as string;
    expect(keyArg).toContain('company:company-1:org-tree:v1');
  });

  it('should bump cache version after structural change', async () => {
    const { service, nodesRepo, cacheService, dataSource } = buildService();
    nodesRepo.findOne.mockResolvedValue({
      id: 'node-1',
      companyId: 'company-1',
      parentId: null,
      order: 0,
      type: 'department',
      name: 'Dept',
      description: null,
      agentId: null,
      metadata: null,
    });
    nodesRepo.save.mockResolvedValue({
      id: 'node-1',
      companyId: 'company-1',
      parentId: null,
      order: 1,
      type: 'department',
      name: 'Dept',
      description: null,
      agentId: null,
      metadata: null,
    });
    cacheService.exists.mockResolvedValue(true);

    dataSource.transaction.mockImplementation(async (cb: any) =>
      cb({
        createQueryBuilder: () => ({
          setLock: () => ({
            where: (_sql: any, params: any) => ({
              getOne: async () =>
                params.id === 'node-1'
                  ? {
                      id: 'node-1',
                      companyId: 'company-1',
                      parentId: null,
                      order: 0,
                      type: 'department',
                      name: 'Dept',
                    }
                  : null,
            }),
          }),
        }),
        save: async (x: any) => x,
        getRepository: () => nodesRepo,
      }),
    );
    await service.moveNode('node-1', { newOrder: 1 }, { id: 'user-1' });

    expect(cacheService.increment).toHaveBeenCalledWith('company:company-1:org-tree:version', 1);
    expect(cacheService.expire).toHaveBeenCalled();
  });

  it('should isolate cache key by company id', async () => {
    const { service, nodesRepo, cacheService, tenantContext } = buildService();
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    nodesRepo.createQueryBuilder.mockReturnValue(qb);
    cacheService.get.mockResolvedValue(null);
    tenantContext.getCompanyId.mockReturnValue('company-2');

    await service.getTree({ search: 'eng' });
    const treeKey = cacheService.get.mock.calls[1][0] as string;
    expect(treeKey).toContain('company:company-2:org-tree:v1');
  });

  it('should publish structure changed event for move operation', async () => {
    const { service, nodesRepo, cacheService, dataSource } = buildService();
    nodesRepo.findOne.mockResolvedValue({
      id: 'node-1',
      companyId: 'company-1',
      parentId: null,
      order: 0,
      type: 'department',
      name: 'Dept',
      description: null,
      agentId: null,
      metadata: null,
    });
    nodesRepo.save.mockResolvedValue({
      id: 'node-1',
      companyId: 'company-1',
      parentId: null,
      order: 1,
      type: 'department',
      name: 'Dept',
      description: null,
      agentId: null,
      metadata: null,
    });
    cacheService.exists.mockResolvedValue(true);

    const messagingService = (service as any).messagingService;
    dataSource.transaction.mockImplementation(async (cb: any) =>
      cb({
        createQueryBuilder: () => ({
          setLock: () => ({
            where: (_sql: any, params: any) => ({
              getOne: async () =>
                params.id === 'node-1'
                  ? {
                      id: 'node-1',
                      companyId: 'company-1',
                      parentId: null,
                      order: 0,
                      type: 'department',
                      name: 'Dept',
                    }
                  : null,
            }),
          }),
        }),
        save: async (x: any) => x,
        getRepository: () => nodesRepo,
      }),
    );
    await service.moveNode('node-1', { newOrder: 1 }, { id: 'user-1' });

    expect(messagingService.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'organization.structure.changed' }),
      expect.objectContaining({ routingKey: 'organization.structure.changed' }),
    );
  });

  it('should persist audit record on update', async () => {
    const { service, nodesRepo, auditRepo } = buildService();
    nodesRepo.findOne.mockResolvedValue({
      id: 'node-1',
      companyId: 'company-1',
      parentId: null,
      order: 0,
      type: 'department',
      name: 'Dept',
      description: null,
      agentId: null,
      metadata: null,
    });
    nodesRepo.save.mockResolvedValue({
      id: 'node-1',
      companyId: 'company-1',
      parentId: null,
      order: 0,
      type: 'department',
      name: 'New Dept',
      description: null,
      agentId: null,
      metadata: null,
    });

    await service.updateNode('node-1', { name: 'New Dept' }, { id: 'user-1' });
    expect(auditRepo.save).toHaveBeenCalled();
  });

  it('should return conflict when move hits lock/deadlock', async () => {
    const { service, dataSource } = buildService();
    dataSource.transaction.mockRejectedValue({ code: '40P01' });

    await expect(
      service.moveNode('node-1', { newOrder: 1 }, { id: 'user-1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should forbid mutation for non owner/admin membership', async () => {
    const { service, membershipsRepo } = buildService();
    membershipsRepo.findOne.mockResolvedValue({
      companyId: 'company-1',
      userId: 'user-2',
      role: 'member',
      isActive: true,
    });

    await expect(
      service.createNode({ type: 'department', name: 'Ops' } as any, { id: 'user-2' }),
    ).rejects.toThrow('仅公司 Owner/Admin 可执行此操作');
  });
});
