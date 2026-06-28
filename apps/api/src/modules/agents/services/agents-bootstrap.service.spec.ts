import { AgentsBootstrapService } from './agents-bootstrap.service.js';
import { BootstrapSkillCatalogService } from './bootstrap-skill-catalog.service.js';

describe('AgentsBootstrapService', () => {
  const TEN_CEO_CORE_SKILL_IDS = Array.from(
    { length: 10 },
    (_, i) => `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  );

  const platformSettingsMock = {
    getFallbackModel: jest.fn(async () => 'gpt-4o-mini'),
    getEffectiveRoleDefaultGlobalSkillNames: jest.fn(async () => []),
  };

  const ceoLayerConfigServiceMock = {
    atomicEnsureAndSync: jest.fn(async () => ({})),
    syncLayerConfigToCeoAgent: jest.fn(async () => undefined),
  };

  const skillBindingValidatorMock = {
    allowGlobalSkillsWhenMissingInCompany: jest
      .fn()
      .mockResolvedValue({ insertedOrgBindings: 10, isGlobalToggled: 0 }),
    mountPlatformGlobalSkillsOnBoard: jest
      .fn()
      .mockResolvedValue({ insertedOrgBindings: 3, isGlobalToggled: 0 }),
    validateSkillsBelongToCompany: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });
  function buildTransactionManager(
    agentSave?: jest.Mock,
    orgNodeSave?: jest.Mock,
    agentFindOne?: jest.Mock,
  ) {
    const assignmentSave = jest.fn(async (payload: unknown) => payload);
    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [] }),
    };
    const assignmentsRepo = {
      findOne: jest.fn(async () => null),
      createQueryBuilder: jest.fn(() => insertChain),
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
        {
          llmKeyId: 'key-1',
          marketplaceAgentId: where.marketplaceAgentId,
          sortOrder: 0,
          ceoLayer: 'strategy',
        },
      ]),
    };
    const agentsTxRepo = {
      findOne: agentFindOne ?? jest.fn(async () => null),
      create: jest.fn((x: unknown) => x),
      save: agentSave ?? jest.fn(async (x: unknown) => x),
    };
    const orgNodesTxRepo = {
      // 让 listTenantNodes 走 catch 分支，回落到构造函数注入的 this.nodesRepo（单测即此模式）
      find: jest.fn(async () => {
        throw new Error('txn_org_nodes_stub_use_fallback');
      }),
      findOne: jest.fn(async () => null),
      update: jest.fn(async () => ({ affected: 1 })),
      save: orgNodeSave ?? jest.fn(async (x: unknown) => x),
      create: jest.fn((x: unknown) => x),
      delete: jest.fn(),
    };
    const manager = {
      query: jest.fn(async () => undefined),
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity?.name === 'CompanyMarketplaceAgentKeyAssignment') return assignmentsRepo;
        if (entity?.name === 'LlmKey') return llmKeysRepo;
        if (entity?.name === 'MarketplaceAgentKeyBinding') return bindingsRepo;
        if (entity?.name === 'Agent') return agentsTxRepo;
        if (entity?.name === 'OrganizationNode') return orgNodesTxRepo;
        throw new Error(`Unexpected repository: ${String(entity?.name)}`);
      }),
    };
    return { manager, assignmentSave, bindingsRepo, insertChain, agentsTxRepo, orgNodesTxRepo };
  }

  it('creates CEO key assignment for company when marketplace bindings exist', async () => {
    const companyId = 'c-1';
    const ceoMarketplaceAgentId = 'ma-ceo';
    const llmKeyId = 'key-1';

    const { manager, bindingsRepo, insertChain } = buildTransactionManager();

    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    };

    const service = new AgentsBootstrapService(
      dataSource as any,
      {} as any,
      { create: jest.fn((x: unknown) => x), save: jest.fn(async () => undefined) } as any,
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
      skillBindingValidatorMock as any,
      { resolveHeadSlug: jest.fn() } as any,
      platformSettingsMock as any,
      ceoLayerConfigServiceMock as any,
      new BootstrapSkillCatalogService(
        platformSettingsMock as any,
        { resolveRequiredGlobalSkillIdsByNames: jest.fn(async () => []) } as any,
        skillBindingValidatorMock as any,
        { bindDefaultSkillsForAgent: jest.fn() } as any,
      ),
    );

    await service.ensureCeoKeyAssignmentForCompany(companyId);

    expect(bindingsRepo.find).toHaveBeenCalledTimes(1);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        marketplaceAgentId: ceoMarketplaceAgentId,
        assignedLlmKeyId: null,
        preferredLlmKeyId: null,
        assignedEmbeddingModelId: null,
      }),
    );
  });

  it('ensureDefaultAgentsForCompany creates marketplace director and executor children when placements provided', async () => {
    const companyId = 'c-1';

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
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.role === 'ceo' && (where.id === 'a-ceo' || where.companyId === companyId)) {
          return {
            id: 'a-ceo',
            companyId,
            role: 'ceo',
            llmKeyId: null,
            metadata: {},
          };
        }
        return null;
      }),
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

    const txCeoAgentFindOne = jest.fn(async ({ where }: { where: { id?: string; role?: string } }) => {
      if (where.id === 'a-ceo' && where.role === 'ceo') {
        return {
          id: 'a-ceo',
          companyId,
          role: 'ceo',
          llmKeyId: null,
          metadata: {},
        };
      }
      return null;
    });
    const { manager } = buildTransactionManager(
      agentsRepo.save as jest.Mock,
      nodesRepo.save as jest.Mock,
      txCeoAgentFindOne,
    );
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    };

    const skillsService = {
      findGlobalSkillIdsByNames: jest.fn(async () => []),
      resolveRequiredGlobalSkillIdsByNames: jest.fn(async (names: string[]) => {
        if (!names.length) return [];
        if (names.includes('ceo-strategic-breakdown')) {
          return TEN_CEO_CORE_SKILL_IDS;
        }
        return names.map(
          (_, i) => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        );
      }),
    };
    const agentSkillService = {
      bindDefaultSkillsForAgent: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AgentsBootstrapService(
      dataSource as never,
      agentsRepo as never,
      { create: jest.fn((x: unknown) => x), save: jest.fn(async () => undefined) } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      marketplaceAgentsRepo as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      nodesRepo as never,
      skillsService as never,
      agentSkillService as never,
      skillBindingValidatorMock as never,
      {
        resolveHeadSlug: jest.fn(async ({ requestedSlug }: { requestedSlug?: string | null }) => requestedSlug || 'head-slug'),
      } as any,
      platformSettingsMock as any,
      ceoLayerConfigServiceMock as any,
      new BootstrapSkillCatalogService(
        platformSettingsMock as any,
        skillsService as any,
        skillBindingValidatorMock as any,
        agentSkillService as any,
      ),
    );

    await service.ensureDefaultAgentsForCompany(companyId, [
      { name: 'Sales', headAgentSlug: 'head-slug', memberAgentSlugs: ['mem-slug'] },
    ] as any);

    expect(ceoLayerConfigServiceMock.atomicEnsureAndSync).toHaveBeenCalled();
    expect(ceoLayerConfigServiceMock.syncLayerConfigToCeoAgent).toHaveBeenCalledWith(
      companyId,
      'a-ceo',
      expect.any(Object),
    );

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
    expect(
      agentSkillService.bindDefaultSkillsForAgent.mock.calls.filter((c) => c[3] === 'director_management_default'),
    ).toHaveLength(0);
  });

  it('ensureDefaultAgentsForCompany binds director global skills when platform returns names and snapshots them on department node', async () => {
    const companyId = 'c-dir-skills';

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
      agentCategory: 'department_head',
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
        id: ent.role === 'director' ? 'a-director' : ent.id ?? `agent-${Math.random().toString(36).slice(2)}`,
      })),
      create: jest.fn((x: unknown) => x),
      delete: jest.fn(),
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.role === 'ceo' && (where.id === 'a-ceo' || where.companyId === companyId)) {
          return {
            id: 'a-ceo',
            companyId,
            role: 'ceo',
            llmKeyId: null,
            metadata: {},
          };
        }
        return null;
      }),
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

    const txCeoAgentFindOne = jest.fn(async ({ where }: { where: { id?: string; role?: string } }) => {
      if (where.id === 'a-ceo' && where.role === 'ceo') {
        return {
          id: 'a-ceo',
          companyId,
          role: 'ceo',
          llmKeyId: null,
          metadata: {},
        };
      }
      return null;
    });
    const { manager } = buildTransactionManager(
      agentsRepo.save as jest.Mock,
      nodesRepo.save as jest.Mock,
      txCeoAgentFindOne,
    );
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    };

    const directorDefaultNames = ['director-task-delegator', 'director-progress-reporter', 'department.knowledge.query'];
    const platformSettingsForDirector = {
      getFallbackModel: jest.fn(async () => 'gpt-4o-mini'),
      getEffectiveRoleDefaultGlobalSkillNames: jest.fn(async (role: string) => {
        if (role === 'director') return [...directorDefaultNames];
        return [];
      }),
    };

    const skillsService = {
      findGlobalSkillIdsByNames: jest.fn(async () => []),
      resolveRequiredGlobalSkillIdsByNames: jest.fn(async (names: string[]) => {
        if (!names.length) return [];
        if (names.includes('ceo-strategic-breakdown')) {
          return TEN_CEO_CORE_SKILL_IDS;
        }
        return names.map((_, i) => `dir-skill-id-${i}`);
      }),
    };
    const agentSkillService = {
      bindDefaultSkillsForAgent: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AgentsBootstrapService(
      dataSource as never,
      agentsRepo as never,
      { create: jest.fn((x: unknown) => x), save: jest.fn(async () => undefined) } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      marketplaceAgentsRepo as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      nodesRepo as never,
      skillsService as never,
      agentSkillService as never,
      skillBindingValidatorMock as never,
      {
        resolveHeadSlug: jest.fn(async ({ requestedSlug }: { requestedSlug?: string | null }) => requestedSlug || 'head-slug'),
      } as any,
      platformSettingsForDirector as any,
      ceoLayerConfigServiceMock as any,
      new BootstrapSkillCatalogService(
        platformSettingsForDirector as any,
        skillsService as any,
        skillBindingValidatorMock as any,
        agentSkillService as any,
      ),
    );

    await service.ensureDefaultAgentsForCompany(companyId, [
      { name: 'Sales', headAgentSlug: 'head-slug', memberAgentSlugs: ['mem-slug'] },
    ] as any);

    expect(platformSettingsForDirector.getEffectiveRoleDefaultGlobalSkillNames).toHaveBeenCalledWith('director');

    expect(skillBindingValidatorMock.mountPlatformGlobalSkillsOnBoard).toHaveBeenCalledWith(companyId, [
      'dir-skill-id-0',
      'dir-skill-id-1',
      'dir-skill-id-2',
    ]);

    const directorBind = agentSkillService.bindDefaultSkillsForAgent.mock.calls.find(
      (c) => c[0] === 'a-director' && c[1] === companyId,
    );
    expect(directorBind).toBeDefined();
    expect(directorBind![2]).toEqual(['dir-skill-id-0', 'dir-skill-id-1', 'dir-skill-id-2']);

    const deptMetaUpdate = (nodesRepo.update as jest.Mock).mock.calls.find(
      (c) => c[0]?.id === deptNode.id && c[1]?.metadata?.managementStructure?.managementSkills,
    );
    expect(deptMetaUpdate).toBeDefined();
    expect(deptMetaUpdate![1].metadata.managementStructure.managementSkills).toEqual(directorDefaultNames);
  });

  it('does not auto-bind marketplace recommendedSkills for department head director', async () => {
    const companyId = 'c-mkt';

    const ceoNode = { id: 'n-ceo', companyId, type: 'ceo', agentId: 'a-ceo' };
    const deptNode = { id: 'n-dept', companyId, type: 'department', name: 'Marketing', order: 0, agentId: null };

    const headMa = {
      id: 'ma-mkt',
      slug: 'marketing-director',
      name: 'Marketing Director',
      isPublished: true,
      agentCategory: 'department_head',
      expertise: 'ex',
      systemPrompt: 'sp',
      boundModelName: null,
      recommendedSkills: ['marketing-campaign-planner', 'growth-experiment-runner'],
    };

    const marketplaceAgentsRepo = {
      findOne: jest.fn(async ({ where }: { where: { slug?: string } }) => {
        if (where.slug === 'ceo') {
          return { id: 'ma-ceo', slug: 'ceo', isPublished: true, boundModelName: null };
        }
        if (where.slug === 'marketing-director') return headMa;
        return null;
      }),
    };

    const agentsRepo = {
      save: jest.fn(async (ent: { id?: string }) => ({ ...ent, id: ent.id ?? 'a-new' })),
      create: jest.fn((x: unknown) => x),
      delete: jest.fn(),
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.role === 'ceo' && (where.id === 'a-ceo' || where.companyId === companyId)) {
          return {
            id: 'a-ceo',
            companyId,
            role: 'ceo',
            llmKeyId: null,
            metadata: {},
          };
        }
        return null;
      }),
    };

    const txCeoAgentFindOneMkt = jest.fn(async ({ where }: { where: { id?: string; role?: string } }) => {
      if (where.id === 'a-ceo' && where.role === 'ceo') {
        return {
          id: 'a-ceo',
          companyId,
          role: 'ceo',
          llmKeyId: null,
          metadata: {},
        };
      }
      return null;
    });
    const { manager } = buildTransactionManager(
      agentsRepo.save as jest.Mock,
      undefined,
      txCeoAgentFindOneMkt,
    );
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
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

    const skillsService = {
      findGlobalSkillIdsByNames: jest.fn(async () => []),
      resolveRequiredGlobalSkillIdsByNames: jest.fn(async (names: string[]) => {
        if (!names.length) return [];
        if (names.includes('ceo-strategic-breakdown')) {
          return TEN_CEO_CORE_SKILL_IDS;
        }
        return names.map(
          (_, i) => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        );
      }),
    };
    const agentSkillService = {
      bindDefaultSkillsForAgent: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AgentsBootstrapService(
      dataSource as never,
      agentsRepo as never,
      { create: jest.fn((x: unknown) => x), save: jest.fn(async () => undefined) } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      marketplaceAgentsRepo as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      nodesRepo as never,
      skillsService as never,
      agentSkillService as never,
      skillBindingValidatorMock as never,
      {
        resolveHeadSlug: jest.fn(async () => 'marketing-director'),
      } as any,
      platformSettingsMock as any,
      ceoLayerConfigServiceMock as any,
      new BootstrapSkillCatalogService(
        platformSettingsMock as any,
        skillsService as any,
        skillBindingValidatorMock as any,
        agentSkillService as any,
      ),
    );

    await service.ensureDefaultAgentsForCompany(companyId);

    expect(ceoLayerConfigServiceMock.syncLayerConfigToCeoAgent).toHaveBeenCalledWith(
      companyId,
      'a-ceo',
      expect.any(Object),
    );

    expect(
      skillsService.resolveRequiredGlobalSkillIdsByNames.mock.calls.some((c) =>
        Array.isArray(c[0]) && c[0].includes('marketing-campaign-planner'),
      ),
    ).toBe(false);
    expect(
      agentSkillService.bindDefaultSkillsForAgent.mock.calls.some((c) => c[3] === 'marketplace_recommended'),
    ).toBe(false);
  });

  it('ensureDefaultAgentsForCompany resolves director from marketplace when no placements', async () => {
    const companyId = 'c-2';

    const ceoNode = { id: 'n-ceo', companyId, type: 'ceo', agentId: 'a-ceo' };
    const deptNode = { id: 'n-dept', companyId, type: 'department', name: 'Ops', order: 0, agentId: null };

    const headMa = {
      id: 'ma-head',
      slug: 'ops-director',
      name: 'Ops Director',
      isPublished: true,
      agentCategory: 'department_head',
      expertise: 'ex',
      systemPrompt: 'sp',
      boundModelName: null,
    };
    const marketplaceAgentsRepo = {
      findOne: jest.fn(async ({ where }: { where: { slug?: string } }) => {
        if (where.slug === 'ceo') {
          return { id: 'ma-ceo', slug: 'ceo', isPublished: true, boundModelName: null };
        }
        if (where.slug === 'ops-director') return headMa;
        return null;
      }),
    };

    const agentsRepo = {
      save: jest.fn(async (ent: { id?: string }) => ({ ...ent, id: ent.id ?? 'a-new' })),
      create: jest.fn((x: unknown) => x),
      delete: jest.fn(),
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.role === 'ceo' && (where.id === 'a-ceo' || where.companyId === companyId)) {
          return {
            id: 'a-ceo',
            companyId,
            role: 'ceo',
            llmKeyId: null,
            metadata: {},
          };
        }
        return null;
      }),
    };

    const txCeoAgentFindOneOps = jest.fn(async ({ where }: { where: { id?: string; role?: string } }) => {
      if (where.id === 'a-ceo' && where.role === 'ceo') {
        return {
          id: 'a-ceo',
          companyId,
          role: 'ceo',
          llmKeyId: null,
          metadata: {},
        };
      }
      return null;
    });
    const { manager } = buildTransactionManager(
      agentsRepo.save as jest.Mock,
      undefined,
      txCeoAgentFindOneOps,
    );
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
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

    const skillsService = {
      findGlobalSkillIdsByNames: jest.fn(async () => []),
      resolveRequiredGlobalSkillIdsByNames: jest.fn(async (names: string[]) => {
        if (!names.length) return [];
        if (names.includes('ceo-strategic-breakdown')) {
          return TEN_CEO_CORE_SKILL_IDS;
        }
        return names.map(
          (_, i) => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        );
      }),
    };
    const agentSkillService = { bindDefaultSkillsForAgent: jest.fn().mockResolvedValue(undefined) };

    const service = new AgentsBootstrapService(
      dataSource as never,
      agentsRepo as never,
      { create: jest.fn((x: unknown) => x), save: jest.fn(async () => undefined) } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      marketplaceAgentsRepo as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      nodesRepo as never,
      skillsService as never,
      agentSkillService as never,
      skillBindingValidatorMock as never,
      {
        resolveHeadSlug: jest.fn(async () => 'ops-director'),
      } as any,
      platformSettingsMock as any,
      ceoLayerConfigServiceMock as any,
      new BootstrapSkillCatalogService(
        platformSettingsMock as any,
        skillsService as any,
        skillBindingValidatorMock as any,
        agentSkillService as any,
      ),
    );

    await service.ensureDefaultAgentsForCompany(companyId);

    expect(ceoLayerConfigServiceMock.syncLayerConfigToCeoAgent).toHaveBeenCalledWith(
      companyId,
      'a-ceo',
      expect.any(Object),
    );

    expect(agentsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'director',
        name: 'Ops Director',
        metadata: expect.objectContaining({ marketplaceAgentId: headMa.id }),
      }),
    );
    expect(nodesRepo.save).not.toHaveBeenCalled();
  });

  it('after creating CEO agent, initializes company ceo_layer_config from template and syncs agent skills', async () => {
    const companyId = 'c-10';

    const ceoNode = { id: 'n-ceo', companyId, type: 'ceo', name: 'CEO', agentId: null };
    const layerSkill = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
    const ceoMa = {
      id: 'ma-ceo',
      slug: 'ceo',
      isPublished: true,
      boundModelName: null,
      expertise: 'ceo',
      systemPrompt: 'sp',
      ceoLayerConfig: {
        strategy: { skillIds: [layerSkill] },
        orchestration: { skillIds: [] },
        supervision: { skillIds: [] },
      },
    };

    const marketplaceAgentsRepo = {
      findOne: jest.fn(async ({ where }: { where: { slug?: string } }) => {
        if (where.slug === 'ceo') return ceoMa;
        return null;
      }),
    };

    const agentsRepo = {
      save: jest.fn(async (ent: { id?: string }) => ({ ...ent, id: ent.id ?? 'a-ceo-created' })),
      create: jest.fn((x: unknown) => x),
      delete: jest.fn(),
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.role === 'ceo' && where.companyId === companyId) {
          return {
            id: 'a-ceo-created',
            companyId,
            role: 'ceo',
            llmKeyId: null,
            metadata: {},
          };
        }
        return null;
      }),
    };

    const { manager } = buildTransactionManager(agentsRepo.save as jest.Mock);
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    };

    const nodesRepo = {
      find: jest.fn(async (opts: { where: { type?: string } }) => {
        if (opts.where.type === 'ceo') return [ceoNode];
        if (opts.where.type === 'department') return [];
        return [];
      }),
      update: jest.fn(async () => ({ affected: 1 })),
      save: jest.fn(),
      create: jest.fn((x: unknown) => x),
      delete: jest.fn(),
    };

    const skillsService = {
      findGlobalSkillIdsByNames: jest.fn(async () => []),
      resolveRequiredGlobalSkillIdsByNames: jest.fn(async () => []),
    };
    const agentSkillService = { bindDefaultSkillsForAgent: jest.fn().mockResolvedValue(undefined) };

    const service = new AgentsBootstrapService(
      dataSource as never,
      agentsRepo as never,
      { create: jest.fn((x: unknown) => x), save: jest.fn(async () => undefined) } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      marketplaceAgentsRepo as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      nodesRepo as never,
      skillsService as never,
      agentSkillService as never,
      skillBindingValidatorMock as never,
      { resolveHeadSlug: jest.fn() } as any,
      platformSettingsMock as any,
      ceoLayerConfigServiceMock as any,
      new BootstrapSkillCatalogService(
        platformSettingsMock as any,
        skillsService as any,
        skillBindingValidatorMock as any,
        agentSkillService as any,
      ),
    );

    await service.ensureDefaultAgentsForCompany(companyId);

    expect(ceoLayerConfigServiceMock.atomicEnsureAndSync).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        strategy: expect.objectContaining({ skillIds: [layerSkill] }),
      }),
    );
    expect(ceoLayerConfigServiceMock.syncLayerConfigToCeoAgent).toHaveBeenCalledWith(
      companyId,
      'a-ceo-created',
      expect.any(Object),
    );
  });
});
