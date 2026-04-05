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
import { SkillsService } from './skills.service.js';

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
    private readonly skillsService: SkillsService,
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

  async bindSkills(nodeId: string, dto: BindOrganizationNodeSkillsDto, actor: Actor): Promise<string[]> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManageStructure(companyId, actor);
    const node = await this.nodesRepo.findOne({ where: { id: nodeId, companyId } });
    if (!node) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '组织节点不存在',
      });
    }
    for (const skillId of dto.skillIds) {
      await this.skillsService.assertSkillUsableByTenant(skillId, companyId);
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
    return this.listSkillIdsForNode(nodeId, companyId);
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
    return this.listSkillIdsForNode(nodeId, companyId);
  }
}
