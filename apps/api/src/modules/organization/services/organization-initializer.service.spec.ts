import { resolveDefaultDepartments } from '@contracts/types';
import { OrganizationInitializerService } from './organization-initializer.service.js';

describe('OrganizationInitializerService', () => {
  function buildService() {
    const savedDepartmentNames: string[] = [];
    let idCounter = 0;
    const nodesRepo: any = {
      count: jest.fn(async () => 0),
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
    const svc = new OrganizationInitializerService(nodesRepo, agentsBootstrap);
    return { svc, nodesRepo, agentsBootstrap, savedDepartmentNames };
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

  it('uses resolveDefaultDepartments and passes undefined placements to bootstrap when omitted', async () => {
    const { svc, agentsBootstrap, savedDepartmentNames } = buildService();
    await svc.initializeForCompany('c-1', '科技', 'software');
    const expected = resolveDefaultDepartments('software', '科技');
    expect(savedDepartmentNames).toEqual(expected);
    expect(agentsBootstrap.ensureDefaultAgentsForCompany).toHaveBeenCalledWith('c-1', undefined);
  });

  it('treats empty placements array as default departments', async () => {
    const { svc, agentsBootstrap } = buildService();
    await svc.initializeForCompany('c-1', '科技', 'software', []);
    expect(agentsBootstrap.ensureDefaultAgentsForCompany).toHaveBeenCalledWith('c-1', undefined);
  });

  it('falls back to default departments when all placement names are blank after trim', async () => {
    const { svc, agentsBootstrap, savedDepartmentNames } = buildService();
    await svc.initializeForCompany('c-1', '科技', 'software', [
      { name: '   ', headAgentSlug: null, memberAgentSlugs: [] },
    ] as any);
    expect(savedDepartmentNames).toEqual(resolveDefaultDepartments('software', '科技'));
    expect(agentsBootstrap.ensureDefaultAgentsForCompany).toHaveBeenCalledWith('c-1', undefined);
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

  it('skips init when company already has nodes', async () => {
    const nodesRepo: any = {
      count: jest.fn(async () => 3),
      create: jest.fn(),
      save: jest.fn(),
    };
    const agentsBootstrap: any = {
      ensureDefaultAgentsForCompany: jest.fn(),
    };
    const svc = new OrganizationInitializerService(nodesRepo, agentsBootstrap);
    await svc.initializeForCompany('c-1', '科技', 'software', [{ name: 'X', memberAgentSlugs: [] } as any]);
    expect(nodesRepo.save).not.toHaveBeenCalled();
    expect(agentsBootstrap.ensureDefaultAgentsForCompany).not.toHaveBeenCalled();
  });
});
