import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import { ApprovalService } from '../../approval/services/approval.service.js';
import { Company } from '../../companies/entities/company.entity.js';
import { SkillMcpToolBinding } from '../entities/skill-mcp-tool-binding.entity.js';
import { Skill } from '../entities/skill.entity.js';
import { SkillVersion } from '../entities/skill-version.entity.js';
import { SkillsManagementService } from './skills-management.service.js';

describe('SkillsManagementService', () => {
  function makeQb() {
    return {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
  }

  async function makeModule(opts?: { tenantCompanyId?: string | null }) {
    const qb = makeQb();
    const skillsRepo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn(async (x: any) => ({
        id: x.id ?? 'skill-1',
        name: x.name ?? 'generate_hierarchical_plan',
        displayName: x.displayName ?? '层级计划生成',
        description: x.description ?? null,
        promptTemplate: x.promptTemplate ?? '',
        inputSchema: x.inputSchema ?? null,
        outputSchema: x.outputSchema ?? null,
        toolSchema: x.toolSchema ?? null,
        securityProfile: x.securityProfile ?? 'safe',
        requiredPermissions: x.requiredPermissions ?? [],
        isEnabled: x.isEnabled ?? false,
        version: x.version ?? 1,
        approvalRequestId: x.approvalRequestId ?? null,
        approvalStatus: x.approvalStatus ?? 'none',
        implementationType: 'builtin',
        semverVersion: '1.0.0',
        isPublic: true,
        isSystem: false,
        handlerConfig: null,
        changeReason: x.changeReason ?? null,
        companyId: x.companyId ?? null,
        updatedAt: new Date(),
      })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => qb),
    };
    const versionsRepo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
    };
    const bindingsRepo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const mcpToolsRepo = {
      count: jest.fn().mockResolvedValue(0),
    };
    const companiesRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'company-fallback-1' }),
    };
    const tenantContext = {
      getCompanyId: jest
        .fn()
        .mockReturnValue(opts?.tenantCompanyId === undefined ? 'company-ctx-1' : opts.tenantCompanyId),
      setCompanyId: jest.fn(),
    };
    const approvalService = {
      create: jest.fn().mockResolvedValue({ id: 'approval-1' }),
    };
    const messaging = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const mod = await Test.createTestingModule({
      providers: [
        SkillsManagementService,
        { provide: getRepositoryToken(Skill), useValue: skillsRepo },
        { provide: getRepositoryToken(SkillVersion), useValue: versionsRepo },
        { provide: getRepositoryToken(SkillMcpToolBinding), useValue: bindingsRepo },
        { provide: getRepositoryToken(Company), useValue: companiesRepo },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: ApprovalService, useValue: approvalService },
        { provide: MessagingService, useValue: messaging },
      ],
    }).compile();
    return { service: mod.get(SkillsManagementService), skillsRepo, mcpToolsRepo, approvalService, companiesRepo, tenantContext, qb };
  }

  it('allows superadmin to create platform-level skill', async () => {
    const { service, approvalService } = await makeModule();
    const out = await service.create(
      {
        companyId: null,
        name: 'generate_hierarchical_plan',
        displayName: '层级计划生成',
        promptTemplate: 'Plan by {goal}',
        securityProfile: 'safe',
        changeReason: 'init',
      },
      { id: 'u-super', roles: ['superadmin'] },
    );
    expect(out.companyId).toBeNull();
    expect(out.approvalStatus).toBe('none');
    expect(approvalService.create).not.toHaveBeenCalled();
  });

  it('allows admin to create platform-level skill', async () => {
    const { service } = await makeModule();
    await expect(
      service.create(
        {
          companyId: null,
          name: 'x',
          displayName: 'x',
          promptTemplate: 'x',
          securityProfile: 'safe',
          changeReason: 'x',
        },
        { id: 'u-admin', roles: ['admin'] },
      ),
    ).resolves.toEqual(expect.objectContaining({ companyId: null, approvalStatus: 'none' }));
  });

  it('does not require secondary approver on create', async () => {
    const { service } = await makeModule();
    const out = await service.create(
      {
        name: 'dangerous_skill',
        displayName: '危险技能',
        promptTemplate: 'do shell',
        securityProfile: 'dangerous',
        changeReason: 'risk',
      },
      { id: 'u-admin', roles: ['admin'] },
    );
    expect(out.approvalStatus).toBe('none');
  });

  it('binds mcp tools with strict scope validation', async () => {
    const { service, skillsRepo, mcpToolsRepo } = await makeModule();
    skillsRepo.findOne.mockResolvedValue({
      id: 'skill-22',
      name: 's1',
      companyId: 'company-22',
      securityProfile: 'safe',
      version: 1,
      approvalStatus: 'approved',
      isEnabled: true,
    });
    mcpToolsRepo.count.mockResolvedValue(1);
    const out = await service.bindMcpTools(
      'skill-22',
      { mcpToolIds: ['mcp-1'], changeReason: 'bind for workflow' },
      { id: 'u-admin', roles: ['admin'] },
    );
    expect(out.approvalStatus).toBe('pending');
    expect(out.isEnabled).toBe(true);
  });

  it('bypasses approval for platform skill bind by admin', async () => {
    const { service, skillsRepo, mcpToolsRepo, approvalService } = await makeModule();
    skillsRepo.findOne.mockResolvedValue({
      id: 'skill-platform-2',
      name: 's-platform',
      companyId: null,
      securityProfile: 'safe',
      version: 1,
      approvalStatus: 'approved',
      isEnabled: true,
    });
    mcpToolsRepo.count.mockResolvedValue(1);
    const out = await service.bindMcpTools(
      'skill-platform-2',
      { mcpToolIds: ['mcp-1'], changeReason: 'platform bind' },
      { id: 'u-admin', roles: ['admin'] },
    );
    expect(approvalService.create).not.toHaveBeenCalled();
    expect(out.approvalStatus).toBe('none');
    expect(out.approvalRequestId).toBeNull();
  });

  it('uses fallback company for platform skill approval without tenant context', async () => {
    const { service, skillsRepo, approvalService, companiesRepo, tenantContext } = await makeModule({ tenantCompanyId: null });
    skillsRepo.findOne.mockResolvedValue({
      id: 'skill-platform-1',
      name: 's-platform',
      companyId: null,
      securityProfile: 'safe',
      version: 1,
      approvalStatus: 'approved',
      isEnabled: true,
    });
    const out = await service.update(
      'skill-platform-1',
      { changeReason: 'platform update', displayName: 'platform v2' },
      { id: 'u-admin', roles: ['admin'] },
    );
    expect(companiesRepo.findOne).not.toHaveBeenCalled();
    expect(approvalService.create).not.toHaveBeenCalled();
    expect(tenantContext.setCompanyId).not.toHaveBeenCalled();
    expect(out.approvalStatus).toBe('none');
    expect(out.approvalRequestId).toBeNull();
  });
});

