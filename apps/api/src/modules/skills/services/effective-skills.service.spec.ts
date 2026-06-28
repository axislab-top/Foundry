import { EffectiveSkillsService } from './effective-skills.service.js';

describe('EffectiveSkillsService (strict isolation)', () => {
  const mkRepo = <T extends object>(impl: Partial<Record<keyof any, any>>) => impl as any;

  it('non-CEO: returns direct skills only when dept opt-in is missing', async () => {
    const agentsRepo = mkRepo({
      findOne: jest.fn(async () => ({ organizationNodeId: 'n_agent', role: 'director' })),
      query: jest.fn(async () => [
        { id: 'n_agent', parent_id: 'n_ceo', type: 'agent', metadata: null, depth: 0 },
        { id: 'n_ceo', parent_id: null, type: 'ceo', metadata: null, depth: 1 },
      ]),
    });
    const agentSkillsRepo = mkRepo({
      find: jest.fn(async () => [{ skillId: 's_direct_1' }, { skillId: 's_direct_2' }]),
    });
    const orgNodeSkillsRepo = mkRepo({
      find: jest.fn(async () => [{ skillId: 's_should_not_leak' }]),
    });
    const svc = new EffectiveSkillsService(agentsRepo, agentSkillsRepo, orgNodeSkillsRepo);

    const ids = await svc.getEffectiveSkillIdsForAgent('a1', 'c1');
    expect(ids.sort()).toEqual(['s_direct_1', 's_direct_2']);
    expect(orgNodeSkillsRepo.find).not.toHaveBeenCalled();
  });

  it('non-CEO: includes department-scoped org node skills only when dept opt-in is enabled', async () => {
    const agentsRepo = mkRepo({
      findOne: jest.fn(async () => ({ organizationNodeId: 'n_agent', role: 'director' })),
      query: jest.fn(async () => [
        { id: 'n_agent', parent_id: 'n_dept', type: 'agent', metadata: null, depth: 0 },
        {
          id: 'n_dept',
          parent_id: 'n_ceo',
          type: 'department',
          metadata: { allowDeptSharedSkills: true, platformDepartmentSlug: 'sales' },
          depth: 1,
        },
        { id: 'n_ceo', parent_id: null, type: 'ceo', metadata: null, depth: 2 },
      ]),
    });
    const agentSkillsRepo = mkRepo({
      find: jest.fn(async () => [{ skillId: 's_direct' }]),
    });
    const orgNodeSkillsRepo = mkRepo({
      find: jest.fn(async () => [{ skillId: 's_dept' }, { skillId: 's_agent_node' }]),
    });
    const svc = new EffectiveSkillsService(agentsRepo, agentSkillsRepo, orgNodeSkillsRepo);

    const ids = await svc.getEffectiveSkillIdsForAgent('a1', 'c1');
    expect(ids.sort()).toEqual(['s_agent_node', 's_dept', 's_direct'].sort());
    expect(orgNodeSkillsRepo.find).toHaveBeenCalledTimes(1);
  });

  it('CEO: keeps legacy full-chain inheritance behavior', async () => {
    const agentsRepo = mkRepo({
      findOne: jest.fn(async () => ({ organizationNodeId: 'n_ceo_agent', role: 'ceo' })),
      query: jest.fn(async () => [
        { id: 'n_ceo_agent', parent_id: 'n_ceo', type: 'agent', metadata: null, depth: 0 },
        { id: 'n_ceo', parent_id: null, type: 'ceo', metadata: null, depth: 1 },
      ]),
    });
    const agentSkillsRepo = mkRepo({
      find: jest.fn(async () => [{ skillId: 's_direct' }]),
    });
    const orgNodeSkillsRepo = mkRepo({
      find: jest.fn(async () => [{ skillId: 's_company_level' }]),
    });
    const svc = new EffectiveSkillsService(agentsRepo, agentSkillsRepo, orgNodeSkillsRepo);

    const ids = await svc.getEffectiveSkillIdsForAgent('a1', 'c1');
    expect(ids.sort()).toEqual(['s_company_level', 's_direct'].sort());
  });

  describe('getDepartmentSharingContextForAgent', () => {
    it('director: defaults allowDeptSharedMemory true when metadata omits flag', async () => {
      const agentsRepo = mkRepo({
        findOne: jest.fn(async () => ({ organizationNodeId: 'n_agent', role: 'director' })),
        query: jest.fn(async () => [
          { id: 'n_agent', parent_id: 'n_dept', type: 'agent', metadata: null, depth: 0 },
          {
            id: 'n_dept',
            parent_id: 'n_ceo',
            type: 'department',
            metadata: { platformDepartmentSlug: 'sales' },
            depth: 1,
          },
          { id: 'n_ceo', parent_id: null, type: 'ceo', metadata: null, depth: 2 },
        ]),
      });
      const agentSkillsRepo = mkRepo({});
      const orgNodeSkillsRepo = mkRepo({});
      const svc = new EffectiveSkillsService(agentsRepo, agentSkillsRepo, orgNodeSkillsRepo);

      const ctx = await svc.getDepartmentSharingContextForAgent({ agentId: 'a1', companyId: 'c1' });
      expect(ctx.allowDeptSharedMemory).toBe(true);
      expect(ctx.departmentSlug).toBe('sales');
      expect(ctx.departmentOrganizationNodeId).toBe('n_dept');
    });

    it('director: explicit allowDeptSharedMemory false is honored', async () => {
      const agentsRepo = mkRepo({
        findOne: jest.fn(async () => ({ organizationNodeId: 'n_agent', role: 'director' })),
        query: jest.fn(async () => [
          { id: 'n_agent', parent_id: 'n_dept', type: 'agent', metadata: null, depth: 0 },
          {
            id: 'n_dept',
            parent_id: null,
            type: 'department',
            metadata: { platformDepartmentSlug: 'ops', allowDeptSharedMemory: false },
            depth: 1,
          },
        ]),
      });
      const svc = new EffectiveSkillsService(agentsRepo, mkRepo({}), mkRepo({}));
      const ctx = await svc.getDepartmentSharingContextForAgent({ agentId: 'a1', companyId: 'c1' });
      expect(ctx.allowDeptSharedMemory).toBe(false);
    });

    it('executor: defaults allowDeptSharedMemory true under department when metadata omits flag', async () => {
      const agentsRepo = mkRepo({
        findOne: jest.fn(async () => ({ organizationNodeId: 'n_agent', role: 'executor' })),
        query: jest.fn(async () => [
          { id: 'n_agent', parent_id: 'n_dept', type: 'agent', metadata: null, depth: 0 },
          {
            id: 'n_dept',
            parent_id: null,
            type: 'department',
            metadata: { platformDepartmentSlug: 'sales' },
            depth: 1,
          },
        ]),
      });
      const svc = new EffectiveSkillsService(agentsRepo, mkRepo({}), mkRepo({}));
      const ctx = await svc.getDepartmentSharingContextForAgent({ agentId: 'a1', companyId: 'c1' });
      expect(ctx.allowDeptSharedMemory).toBe(true);
      expect(ctx.departmentOrganizationNodeId).toBe('n_dept');
    });

    it('executor: explicit allowDeptSharedMemory false is honored', async () => {
      const agentsRepo = mkRepo({
        findOne: jest.fn(async () => ({ organizationNodeId: 'n_agent', role: 'executor' })),
        query: jest.fn(async () => [
          { id: 'n_agent', parent_id: 'n_dept', type: 'agent', metadata: null, depth: 0 },
          {
            id: 'n_dept',
            parent_id: null,
            type: 'department',
            metadata: { platformDepartmentSlug: 'sales', allowDeptSharedMemory: false },
            depth: 1,
          },
        ]),
      });
      const svc = new EffectiveSkillsService(agentsRepo, mkRepo({}), mkRepo({}));
      const ctx = await svc.getDepartmentSharingContextForAgent({ agentId: 'a1', companyId: 'c1' });
      expect(ctx.allowDeptSharedMemory).toBe(false);
    });
  });
});

