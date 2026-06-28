import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnprocessableEntityException } from '@nestjs/common';
import { SkillBindingValidatorService } from './skill-binding-validator.service.js';
import { Skill } from '../entities/skill.entity.js';
import { SkillRevision } from '../entities/skill-revision.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { OrganizationNodeSkill } from '../../organization/entities/organization-node-skill.entity.js';
import { SkillAuditLog } from '../entities/skill-audit-log.entity.js';
import { ApprovalService } from '../../approval/services/approval.service.js';
import { TenantContextService } from '@service/tenant';
import { CacheService } from '../../../common/cache/cache.service.js';
import { RoleDefaultGlobalSkillsService } from '../../platform-settings/role-default-global-skills.service.js';
import { User } from '../../users/entities/user.entity.js';

const usersRepoMock = { exist: jest.fn().mockResolvedValue(true) };

describe('SkillBindingValidatorService', () => {
  it('validateSkillsBelongToCompany throws 422 when skill not in bound set', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const skillsRepo = {
      createQueryBuilder: jest.fn(() => qb),
      find: jest
        .fn()
        .mockResolvedValueOnce([]) // company-owned in loadBoundSkillIds
        .mockResolvedValueOnce([{ id: 'bad-id', name: 'nope' }]), // name lookup for invalid
    };
    const orgRepo = {
      createQueryBuilder: jest.fn(() => qb),
    };
    const auditRepo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(true),
    };
    const tenant = {
      runWithCompanyId: jest.fn((_cid: string, fn: () => unknown) => Promise.resolve(fn())),
    };
    const revRepo = { createQueryBuilder: jest.fn() };
    const approvalService = { create: jest.fn() };
    const platformSettings = { getEffectiveRoleDefaultGlobalSkillNames: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        SkillBindingValidatorService,
        { provide: getRepositoryToken(Skill), useValue: skillsRepo },
        { provide: getRepositoryToken(SkillRevision), useValue: revRepo },
        { provide: getRepositoryToken(OrganizationNodeSkill), useValue: orgRepo },
        { provide: getRepositoryToken(OrganizationNode), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(SkillAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: usersRepoMock },
        { provide: TenantContextService, useValue: tenant },
        { provide: CacheService, useValue: cache },
        { provide: ApprovalService, useValue: approvalService },
        { provide: RoleDefaultGlobalSkillsService, useValue: platformSettings },
      ],
    }).compile();

    const svc = mod.get(SkillBindingValidatorService);

    await expect(
      svc.validateSkillsBelongToCompany('cccccccc-cccc-cccc-cccc-cccccccccccc', ['bad-id'], {
        operatorId: 'u1',
        source: 'test',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(skillsRepo.find).toHaveBeenCalled();
    expect(auditRepo.save).toHaveBeenCalled();
  });

  it('invalidateCompanyBoundSkillsCache deletes cache key', async () => {
    const skillsRepo = { createQueryBuilder: jest.fn(), find: jest.fn() };
    const orgRepo = { createQueryBuilder: jest.fn() };
    const auditRepo = { create: jest.fn((x: unknown) => x), save: jest.fn() };
    const cache = { get: jest.fn(), set: jest.fn(), delete: jest.fn().mockResolvedValue(true) };
    const tenant = { runWithCompanyId: jest.fn((_, fn: () => unknown) => Promise.resolve(fn())) };
    const revRepo = { createQueryBuilder: jest.fn() };
    const approvalService = { create: jest.fn() };
    const platformSettings = { getEffectiveRoleDefaultGlobalSkillNames: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        SkillBindingValidatorService,
        { provide: getRepositoryToken(Skill), useValue: skillsRepo },
        { provide: getRepositoryToken(SkillRevision), useValue: revRepo },
        { provide: getRepositoryToken(OrganizationNodeSkill), useValue: orgRepo },
        { provide: getRepositoryToken(OrganizationNode), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(SkillAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: usersRepoMock },
        { provide: TenantContextService, useValue: tenant },
        { provide: CacheService, useValue: cache },
        { provide: ApprovalService, useValue: approvalService },
        { provide: RoleDefaultGlobalSkillsService, useValue: platformSettings },
      ],
    }).compile();
    const svc = mod.get(SkillBindingValidatorService);
    await svc.invalidateCompanyBoundSkillsCache('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(cache.delete).toHaveBeenCalledWith('company:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:bound_skills');
  });

  it('P17: evaluateHighRiskSkillBindingApprovalGate creates skill.binding when published revision is shell', async () => {
    const cid = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const skillId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const skillsRepo = {
      find: jest.fn().mockResolvedValue([{ id: skillId, name: 'custom-skill' }]),
    };
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([
          {
            skillId,
            id: 'rev-1',
            metadata: { securityProfile: 'shell' },
            status: 'published',
            reviewStatus: 'approved',
            version: 1,
          },
        ]),
    };
    const revRepo = { createQueryBuilder: jest.fn(() => qb) };
    const orgRepo = { createQueryBuilder: jest.fn() };
    const auditRepo = { create: jest.fn((x: unknown) => x), save: jest.fn().mockResolvedValue(undefined) };
    const cache = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
    const tenant = { runWithCompanyId: jest.fn((_cid: string, fn: () => unknown) => Promise.resolve(fn())) };
    const approvalCreate = jest.fn().mockResolvedValue({
      id: 'appr-11111111-1111-1111-1111-111111111111',
    });
    const approvalService = { create: approvalCreate };
    const platformSettings = { getEffectiveRoleDefaultGlobalSkillNames: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        SkillBindingValidatorService,
        { provide: getRepositoryToken(Skill), useValue: skillsRepo },
        { provide: getRepositoryToken(SkillRevision), useValue: revRepo },
        { provide: getRepositoryToken(OrganizationNodeSkill), useValue: orgRepo },
        { provide: getRepositoryToken(OrganizationNode), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(SkillAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: usersRepoMock },
        { provide: TenantContextService, useValue: tenant },
        { provide: CacheService, useValue: cache },
        { provide: ApprovalService, useValue: approvalService },
        { provide: RoleDefaultGlobalSkillsService, useValue: platformSettings },
      ],
    }).compile();
    const svc = mod.get(SkillBindingValidatorService);
    const out = await svc.evaluateHighRiskSkillBindingApprovalGate({
      companyId: cid,
      skillIds: [skillId],
      actorId: 'user-1',
      bindingSurface: 'agent',
      context: { agentId: 'ag-1' },
      source: 'test',
    });
    expect(out.status).toBe('pending_approval');
    if (out.status === 'pending_approval') {
      expect(out.approvalRequestId).toBe('appr-11111111-1111-1111-1111-111111111111');
      expect(out.pendingSkillIds).toEqual([skillId]);
    }
    expect(approvalCreate).toHaveBeenCalledWith(
      cid,
      expect.objectContaining({
        actionType: 'skill.binding',
        riskLevel: 'L3',
      }),
    );
    expect(auditRepo.save).toHaveBeenCalled();
  });

  it('allowGlobalSkillsWhenMissingInCompany mounts CEO defaults on Board and invalidates cache', async () => {
    const companyId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const boardId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const skillId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    const skillsRepo = {
      find: jest.fn(async () => [
        { id: skillId, name: 'ceo-strategic-breakdown', companyId: null },
      ]),
      manager: {
        query: jest.fn().mockResolvedValue({ rowCount: 1 }),
      },
    };
    const orgNodeSkillsRepo = {
      createQueryBuilder: jest.fn(),
      manager: {
        query: jest.fn().mockResolvedValue([{ skill_id: skillId }]),
      },
    };
    const organizationNodesRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: boardId,
        companyId,
        type: 'board',
        parentId: null,
      }),
    };
    const auditRepo = { create: jest.fn((x: unknown) => x), save: jest.fn() };
    const cache = { get: jest.fn(), set: jest.fn(), delete: jest.fn().mockResolvedValue(true) };
    const tenant = { runWithCompanyId: jest.fn((_cid: string, fn: () => unknown) => Promise.resolve(fn())) };
    const revRepo = { createQueryBuilder: jest.fn() };
    const approvalService = { create: jest.fn() };

    const platformSettings = {
      getEffectiveRoleDefaultGlobalSkillNames: jest.fn(async (role: string) => {
        if (role === 'ceo') return ['ceo-strategic-breakdown'];
        if (role === 'director') return ['director-default-skill'];
        if (role === 'executor') return ['executor-default-skill'];
        return [];
      }),
    };

    const mod = await Test.createTestingModule({
      providers: [
        SkillBindingValidatorService,
        { provide: getRepositoryToken(Skill), useValue: skillsRepo },
        { provide: getRepositoryToken(SkillRevision), useValue: revRepo },
        { provide: getRepositoryToken(OrganizationNodeSkill), useValue: orgNodeSkillsRepo },
        { provide: getRepositoryToken(OrganizationNode), useValue: organizationNodesRepo },
        { provide: getRepositoryToken(SkillAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: usersRepoMock },
        { provide: TenantContextService, useValue: tenant },
        { provide: CacheService, useValue: cache },
        { provide: ApprovalService, useValue: approvalService },
        { provide: RoleDefaultGlobalSkillsService, useValue: platformSettings },
      ],
    }).compile();

    const svc = mod.get(SkillBindingValidatorService);
    const out = await svc.allowGlobalSkillsWhenMissingInCompany(companyId, [skillId]);

    expect(platformSettings.getEffectiveRoleDefaultGlobalSkillNames).toHaveBeenCalledWith('ceo');
    expect(platformSettings.getEffectiveRoleDefaultGlobalSkillNames).toHaveBeenCalledWith('director');
    expect(platformSettings.getEffectiveRoleDefaultGlobalSkillNames).toHaveBeenCalledWith('executor');

    expect(organizationNodesRepo.findOne).toHaveBeenCalled();
    expect(orgNodeSkillsRepo.manager.query).toHaveBeenCalled();
    expect(cache.delete).toHaveBeenCalledWith(`company:${companyId}:bound_skills`);
    expect(out.insertedOrgBindings).toBe(1);
  });
});
