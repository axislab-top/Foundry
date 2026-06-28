import { OrganizationInitializerService } from './organization-initializer.service.js';

describe('OrganizationInitializerService', () => {
  function buildService() {
    const savedDepartmentNames: string[] = [];
    let idCounter = 0;
    const nodesRepo: any = {
      count: jest.fn(async () => 0),
      find: jest.fn(async () => []),
      create: jest.fn((e: Record<string, unknown>) => ({ ...e })),
      save: jest.fn(async (e: unknown) => {
        if (Array.isArray(e)) {
          for (const row of e as Array<Record<string, unknown> & { id?: string }>) {
            idCounter += 1;
            row.id = row.id ?? `n-${idCounter}`;
            if (row.type === 'department' && typeof row.name === 'string') {
              savedDepartmentNames.push(row.name);
            }
          }
          return e;
        }
        const row = e as Record<string, unknown> & { id?: string };
        idCounter += 1;
        row.id = row.id ?? `n-${idCounter}`;
        return row;
      }),
    };
    const agentsBootstrap: any = {
      ensureDefaultAgentsForCompany: jest.fn().mockResolvedValue(undefined),
    };
    const manager: any = {
      query: jest.fn(async () => [{ ceo_bound_count: 1, active_agent_count: 1 }]),
      getRepository: jest.fn(() => nodesRepo),
    };
    const dataSource: any = {
      query: jest.fn(async () => []),
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };

    const organizationService: any = {
      invalidateTreeCache: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new OrganizationInitializerService(dataSource, agentsBootstrap, organizationService);
    return { svc, nodesRepo, agentsBootstrap, savedDepartmentNames, dataSource, organizationService };
  }

  it('creates departments from wizard placements when provided', async () => {
    const { svc, agentsBootstrap, savedDepartmentNames } = buildService();
    const placements = [
      { name: '  增长部  ', headAgentSlug: null, memberAgentSlugs: [] },
      { name: '研发部', headAgentSlug: null, memberAgentSlugs: [] },
    ];
    await svc.initializeForCompany('c-1', '科技', 'software', placements as any);
    expect(savedDepartmentNames).toEqual(['增长部', '研发部']);
    expect(agentsBootstrap.ensureDefaultAgentsForCompany).toHaveBeenCalledWith('c-1', [
      { name: '增长部', headAgentSlug: null, memberAgentSlugs: [] },
      { name: '研发部', headAgentSlug: null, memberAgentSlugs: [] },
    ]);
  });

  it('creates board and CEO only when no admin defaults and no wizard placements', async () => {
    const { svc, agentsBootstrap, savedDepartmentNames, nodesRepo } = buildService();
    await svc.initializeForCompany('c-1', '科技', 'software');
    expect(savedDepartmentNames).toEqual([]);
    expect(nodesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'board' }));
    expect(nodesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'ceo' }));
    expect(agentsBootstrap.ensureDefaultAgentsForCompany).toHaveBeenCalledWith('c-1', undefined);
  });

  it('uses platform DB defaults when marked in platform_departments', async () => {
    const { svc, agentsBootstrap, savedDepartmentNames, dataSource } = buildService();
    dataSource.query.mockResolvedValueOnce([
      {
        platformDepartmentSlug: 'engineering',
        name: '工程部',
        headAgentSlug: '',
      },
    ]);
    await svc.initializeForCompany('c-1', '科技', 'software');
    expect(savedDepartmentNames).toEqual(['工程部']);
    expect(agentsBootstrap.ensureDefaultAgentsForCompany).toHaveBeenCalledWith('c-1', [
      expect.objectContaining({
        name: '工程部',
        platformDepartmentSlug: 'engineering',
      }),
    ]);
  });

  it('uses admin defaults when placements omitted and DB has default rows', async () => {
    const { svc, agentsBootstrap, dataSource } = buildService();
    dataSource.query.mockResolvedValueOnce([
      {
        platformDepartmentSlug: 'sales',
        name: '销售部',
        headAgentSlug: 'sales-head',
      },
    ]);
    await svc.initializeForCompany('c-1', '科技', 'software');
    expect(agentsBootstrap.ensureDefaultAgentsForCompany).toHaveBeenCalledWith('c-1', [
      expect.objectContaining({
        name: '销售部',
        headAgentSlug: 'sales-head',
        platformDepartmentSlug: 'sales',
      }),
    ]);
  });

  it('treats empty placements array as admin-configured defaults', async () => {
    const { svc, agentsBootstrap, dataSource } = buildService();
    dataSource.query.mockResolvedValueOnce([
      {
        platformDepartmentSlug: 'product',
        name: '产品部',
        headAgentSlug: '',
      },
    ]);
    await svc.initializeForCompany('c-1', '科技', 'software', []);
    expect(agentsBootstrap.ensureDefaultAgentsForCompany).toHaveBeenCalledWith(
      'c-1',
      expect.arrayContaining([
        expect.objectContaining({ name: '产品部', platformDepartmentSlug: 'product' }),
      ]),
    );
  });

  it('falls back to admin defaults when all placement names are blank after trim', async () => {
    const { svc, agentsBootstrap, savedDepartmentNames, dataSource } = buildService();
    dataSource.query.mockResolvedValueOnce([
      {
        platformDepartmentSlug: 'hr',
        name: '人力资源部',
        headAgentSlug: '',
      },
    ]);
    await svc.initializeForCompany('c-1', '科技', 'software', [
      { name: '   ', headAgentSlug: null, memberAgentSlugs: [] },
    ] as any);
    expect(savedDepartmentNames).toEqual(['人力资源部']);
    expect(agentsBootstrap.ensureDefaultAgentsForCompany).toHaveBeenCalledWith('c-1', expect.any(Array));
  });

  it('dedupes member slugs in placements passed to bootstrap', async () => {
    const { svc, agentsBootstrap } = buildService();
    await svc.initializeForCompany('c-1', '科技', 'software', [
      { name: '销售', headAgentSlug: null, memberAgentSlugs: [' a ', 'a', 'b '] },
    ] as any);
    expect(agentsBootstrap.ensureDefaultAgentsForCompany).toHaveBeenCalledWith('c-1', [
      { name: '销售', headAgentSlug: null, memberAgentSlugs: ['a', 'b'] },
    ]);
  });
});
