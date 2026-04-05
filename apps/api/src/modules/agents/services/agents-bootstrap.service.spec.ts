import { AgentsBootstrapService } from './agents-bootstrap.service.js';

describe('AgentsBootstrapService', () => {
  function buildTransactionManager() {
    const assignmentSave = jest.fn(async (payload: unknown) => payload);
    const assignmentsRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((p: unknown) => p),
      save: assignmentSave,
    };
    const llmKeysRepo = {
      find: jest.fn(async () => [{ id: 'key-1', modelName: 'gpt-4o-mini', isActive: true }]),
      findOne: jest.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        modelName: 'gpt-4o-mini',
        isActive: true,
      })),
    };
    const bindingsRepo = {
      find: jest.fn(async ({ where }: { where: { marketplaceAgentId: string } }) => [
        { llmKeyId: 'key-1', marketplaceAgentId: where.marketplaceAgentId, sortOrder: 0 },
      ]),
    };
    const manager = {
      query: jest.fn(async () => undefined),
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity?.name === 'CompanyMarketplaceAgentKeyAssignment') return assignmentsRepo;
        if (entity?.name === 'LlmKey') return llmKeysRepo;
        if (entity?.name === 'MarketplaceAgentKeyBinding') return bindingsRepo;
        throw new Error(`Unexpected repository: ${String(entity?.name)}`);
      }),
    };
    return { manager, assignmentSave, bindingsRepo };
  }

  it('creates CEO key assignment for company when marketplace bindings exist', async () => {
    const companyId = 'c-1';
    const ceoMarketplaceAgentId = 'ma-ceo';
    const llmKeyId = 'key-1';

    const { manager, assignmentSave, bindingsRepo } = buildTransactionManager();

    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    };

    const service = new AgentsBootstrapService(
      dataSource as any,
      {} as any,
      {} as any,
      {
        findOne: jest.fn(async () => ({
          id: ceoMarketplaceAgentId,
          slug: 'ceo',
          isPublished: true,
          boundModelName: null,
        })),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.ensureCeoKeyAssignmentForCompany(companyId);

    expect(bindingsRepo.find).toHaveBeenCalledTimes(1);
    expect(assignmentSave).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        marketplaceAgentId: ceoMarketplaceAgentId,
        assignedLlmKeyId: llmKeyId,
      }),
    );
  });

  it('ensureDefaultAgentsForCompany creates marketplace director and executor children when placements provided', async () => {
    const companyId = 'c-1';
    const { manager } = buildTransactionManager();
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    };

    const ceoNode = { id: 'n-ceo', companyId, type: 'ceo', agentId: 'a-ceo' };
    const deptNode = { id: 'n-dept', companyId, type: 'department', name: 'Sales', order: 0, agentId: null };

    const ceoMa = {
      id: 'ma-ceo',
      slug: 'ceo',
      isPublished: true,
      boundModelName: null,
    };
    const headMa = {
      id: 'ma-head',
      slug: 'head-slug',
      name: 'Head Name',
      isPublished: true,
      expertise: 'ex',
      systemPrompt: 'sp',
      boundModelName: null,
    };
    const memMa = {
      id: 'ma-mem',
      slug: 'mem-slug',
      name: 'Mem Name',
      isPublished: true,
      expertise: 'ex2',
      systemPrompt: 'sp2',
      boundModelName: null,
    };

    const marketplaceAgentsRepo = {
      findOne: jest.fn(async ({ where }: { where: { slug?: string } }) => {
        if (where.slug === 'ceo') return ceoMa;
        if (where.slug === 'head-slug') return headMa;
        if (where.slug === 'mem-slug') return memMa;
        return null;
      }),
    };

    const agentsRepo = {
      save: jest.fn(async (ent: { id?: string; role?: string }) => ({
        ...ent,
        id: ent.id ?? `agent-${Math.random().toString(36).slice(2)}`,
      })),
      create: jest.fn((x: unknown) => x),
      delete: jest.fn(),
      findOne: jest.fn(),
    };

    const nodesRepo = {
      find: jest.fn(async (opts: { where: { type?: string } }) => {
        if (opts.where.type === 'ceo') return [ceoNode];
        if (opts.where.type === 'department') return [deptNode];
        return [];
      }),
      update: jest.fn(async () => ({ affected: 1 })),
      save: jest.fn(async (ent: { id?: string; type?: string; parentId?: string }) => ({
        ...ent,
        id: ent.id ?? 'n-child-1',
      })),
      create: jest.fn((x: unknown) => x),
      delete: jest.fn(),
    };

    const skillsService = {
      findGlobalSkillIdsByNames: jest.fn(async () => []),
    };
    const agentSkillService = {
      bindDefaultSkillsForAgent: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AgentsBootstrapService(
      dataSource as never,
      agentsRepo as never,
      {} as never,
      marketplaceAgentsRepo as never,
      {} as never,
      {} as never,
      nodesRepo as never,
      skillsService as never,
      agentSkillService as never,
    );

    await service.ensureDefaultAgentsForCompany(companyId, [
      { name: 'Sales', headAgentSlug: 'head-slug', memberAgentSlugs: ['mem-slug'] },
    ] as any);

    expect(agentsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'director',
        name: 'Head Name',
        metadata: expect.objectContaining({ marketplaceAgentId: headMa.id }),
      }),
    );
    expect(agentsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'executor',
        name: 'Mem Name',
        metadata: expect.objectContaining({ marketplaceAgentId: memMa.id }),
      }),
    );
    expect(nodesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent',
        parentId: deptNode.id,
        name: memMa.name,
      }),
    );
    expect(agentSkillService.bindDefaultSkillsForAgent).toHaveBeenCalledWith(
      expect.any(String),
      companyId,
      [],
    );
  });

  it('ensureDefaultAgentsForCompany uses generic director when no placements', async () => {
    const companyId = 'c-2';
    const { manager } = buildTransactionManager();
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    };

    const ceoNode = { id: 'n-ceo', companyId, type: 'ceo', agentId: 'a-ceo' };
    const deptNode = { id: 'n-dept', companyId, type: 'department', name: 'Ops', order: 0, agentId: null };

    const marketplaceAgentsRepo = {
      findOne: jest.fn(async ({ where }: { where: { slug?: string } }) => {
        if (where.slug === 'ceo') {
          return { id: 'ma-ceo', slug: 'ceo', isPublished: true, boundModelName: null };
        }
        return null;
      }),
    };

    const agentsRepo = {
      save: jest.fn(async (ent: { id?: string }) => ({ ...ent, id: ent.id ?? 'a-new' })),
      create: jest.fn((x: unknown) => x),
      delete: jest.fn(),
      findOne: jest.fn(),
    };

    const nodesRepo = {
      find: jest.fn(async (opts: { where: { type?: string } }) => {
        if (opts.where.type === 'ceo') return [ceoNode];
        if (opts.where.type === 'department') return [deptNode];
        return [];
      }),
      update: jest.fn(async () => ({ affected: 1 })),
      save: jest.fn(),
      create: jest.fn((x: unknown) => x),
      delete: jest.fn(),
    };

    const skillsService = { findGlobalSkillIdsByNames: jest.fn(async () => []) };
    const agentSkillService = { bindDefaultSkillsForAgent: jest.fn().mockResolvedValue(undefined) };

    const service = new AgentsBootstrapService(
      dataSource as never,
      agentsRepo as never,
      {} as never,
      marketplaceAgentsRepo as never,
      {} as never,
      {} as never,
      nodesRepo as never,
      skillsService as never,
      agentSkillService as never,
    );

    await service.ensureDefaultAgentsForCompany(companyId);

    expect(agentsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'director',
        name: 'Ops Lead',
        metadata: { systemGenerated: true },
      }),
    );
    expect(nodesRepo.save).not.toHaveBeenCalled();
  });
});
