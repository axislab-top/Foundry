import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { OrganizationNodeSkill } from '../../organization/entities/organization-node-skill.entity.js';
import { BindOrganizationNodeSkillsDto } from '../dto/bind-organization-node-skills.dto.js';
import {
  isSkillBindingGatePending,
  SkillBindingValidatorService,
  type SkillBindingWriteResult,
} from './skill-binding-validator.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class OrganizationNodeSkillsService {
  constructor(
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    @InjectRepository(OrganizationNodeSkill)
    private readonly nodeSkillsRepo: Repository<OrganizationNodeSkill>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    private readonly tenantContext: TenantContextService,
    private readonly skillBindingValidator: SkillBindingValidatorService,
  ) {}

  private getCompanyIdOrThrow(): string {
    const companyId = this.tenantContext.getCompanyId();
    if (!companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Company ID is required',
      });
    }
    return companyId;
  }

  private async assertCanManageStructure(companyId: string, actor?: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可执行此操作',
      });
    }
    if (actor.roles?.includes('admin')) {
      return;
    }
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可执行此操作',
      });
    }
  }

  async listSkillIdsForNode(nodeId: string, companyId?: string): Promise<string[]> {
    const cid = companyId ?? this.getCompanyIdOrThrow();
    const node = await this.nodesRepo.findOne({ where: { id: nodeId, companyId: cid } });
    if (!node) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '组织节点不存在',
      });
    }
    const rows = await this.nodeSkillsRepo.find({
      where: { organizationNodeId: nodeId, companyId: cid },
      select: ['skillId'],
    });
    return rows.map((r) => r.skillId);
  }

  async bindSkills(nodeId: string, dto: BindOrganizationNodeSkillsDto, actor: Actor): Promise<SkillBindingWriteResult> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManageStructure(companyId, actor);
    const node = await this.nodesRepo.findOne({ where: { id: nodeId, companyId } });
    if (!node) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '组织节点不存在',
      });
    }
    await this.skillBindingValidator.validateSkillsAssignableToOrgNode(companyId, dto.skillIds, {
      operatorId: actor.id,
      source: 'organization.node.skills.bind',
    });
    const existingIds = new Set(await this.listSkillIdsForNode(nodeId, companyId));
    const newlyAdded = dto.skillIds.filter((id) => !existingIds.has(id));
    if (newlyAdded.length > 0) {
      // P17：与 Agent 绑定、CEO 一键同步共用同一套高危档位闸门（非 P17.1 扩展项）。
      const gate = await this.skillBindingValidator.evaluateHighRiskSkillBindingApprovalGate({
        companyId,
        skillIds: newlyAdded,
        actorId: actor.id,
        bindingSurface: 'org_node',
        context: { organizationNodeId: nodeId },
        source: 'organization.node.skills.bind',
      });
      if (isSkillBindingGatePending(gate)) {
        return {
          outcome: 'pending_approval',
          approvalRequestId: gate.approvalRequestId,
          pendingSkillIds: gate.pendingSkillIds,
          message: gate.message,
        };
      }
    }
    for (const skillId of dto.skillIds) {
      const exists = await this.nodeSkillsRepo.findOne({
        where: { organizationNodeId: nodeId, skillId, companyId },
      });
      if (!exists) {
        await this.nodeSkillsRepo.save(
          this.nodeSkillsRepo.create({
            organizationNodeId: nodeId,
            skillId,
            companyId,
          }),
        );
      }
    }
    await this.skillBindingValidator.invalidateCompanyBoundSkillsCache(companyId);
    const skillIds = await this.listSkillIdsForNode(nodeId, companyId);
    return { outcome: 'bound', skillIds };
  }

  async unbindSkills(nodeId: string, dto: BindOrganizationNodeSkillsDto, actor: Actor): Promise<string[]> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManageStructure(companyId, actor);
    const node = await this.nodesRepo.findOne({ where: { id: nodeId, companyId } });
    if (!node) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '组织节点不存在',
      });
    }
    await this.nodeSkillsRepo.delete({
      organizationNodeId: nodeId,
      companyId,
      skillId: In(dto.skillIds),
    });
    await this.skillBindingValidator.invalidateCompanyBoundSkillsCache(companyId);
    return this.listSkillIdsForNode(nodeId, companyId);
  }
}
