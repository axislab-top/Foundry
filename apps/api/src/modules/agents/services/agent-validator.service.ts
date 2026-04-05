import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import type { OrganizationNodeType } from '../../organization/entities/organization-node.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import type { AgentRole } from '../entities/agent.entity.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class AgentValidatorService {
  constructor(
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
  ) {}

  async assertCanManageAgents(companyId: string, actor?: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可执行此操作',
      });
    }
    if (actor.roles?.some((r) => r === 'admin' || r === 'superadmin')) {
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

  /** 任意活跃公司成员（含 owner/admin/member）；平台管理员可跨租户代操作 */
  async assertActiveCompanyMember(companyId: string, actor?: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '需要登录',
      });
    }
    if (actor.roles?.some((r) => r === 'admin' || r === 'superadmin')) {
      return;
    }
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司成员可执行此操作',
      });
    }
  }

  allowedRolesForNodeType(nodeType: OrganizationNodeType): AgentRole[] {
    switch (nodeType) {
      case 'ceo':
        return ['ceo'];
      case 'department':
        return ['director'];
      case 'board':
        return ['board_member'];
      case 'agent':
        return ['executor', 'board_member'];
      default:
        return [];
    }
  }

  assertRoleMatchesNode(node: OrganizationNode, role: AgentRole): void {
    const allowed = this.allowedRolesForNodeType(node.type);
    if (!allowed.includes(role)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `节点类型 ${node.type} 不允许角色 ${role}`,
      });
    }
  }

  async assertNodeExists(id: string, companyId: string): Promise<OrganizationNode> {
    const node = await this.nodesRepo.findOne({ where: { id, companyId } });
    if (!node) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '组织节点不存在',
      });
    }
    return node;
  }

  assertNodeHasNoAgent(node: OrganizationNode): void {
    if (node.agentId) {
      throw new BadRequestException({
        code: ErrorCode.RESOURCE_CONFLICT,
        message: '该组织节点已绑定 Agent',
      });
    }
  }
}
