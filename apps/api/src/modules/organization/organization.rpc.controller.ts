import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { OrganizationService } from './services/organization.service.js';
import { QueryOrganizationTreeDto } from './dto/query-organization-tree.dto.js';
import { MoveNodeDto } from './dto/move-node.dto.js';
import { UpdateNodeDto } from './dto/update-node.dto.js';
import { CreateOrganizationNodeDto } from './dto/create-organization-node.dto.js';
import { AddDepartmentFromPlatformDto } from './dto/add-department-from-platform.dto.js';
import { TenantContextService } from '@service/tenant';
import { BindOrganizationNodeSkillsDto } from '../skills/dto/bind-organization-node-skills.dto.js';
import { OrganizationNodeSkillsService } from '../skills/services/organization-node-skills.service.js';
import { MemoryKnowledgeService } from '../memory/services/memory-knowledge.service.js';

class OrganizationNodeIdDto {
  @IsUUID()
  id: string;
}

class OrganizationActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  organizationNodeIds?: string[];
}

class OrganizationBaseRpcContextDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationActorDto)
  actor?: OrganizationActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class OrganizationMoveNodeRpcDto extends OrganizationBaseRpcContextDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => MoveNodeDto)
  data: MoveNodeDto;
}

class OrganizationUpdateNodeRpcDto extends OrganizationBaseRpcContextDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateNodeDto)
  data: UpdateNodeDto;
}

class OrganizationTreeRpcDto extends QueryOrganizationTreeDto {}

class OrganizationCreateNodeRpcDto extends OrganizationBaseRpcContextDto {
  @ValidateNested()
  @Type(() => CreateOrganizationNodeDto)
  data: CreateOrganizationNodeDto;
}

class OrganizationAddDepartmentFromPlatformRpcDto extends OrganizationBaseRpcContextDto {
  @ValidateNested()
  @Type(() => OrganizationActorDto)
  actor: OrganizationActorDto;

  @ValidateNested()
  @Type(() => AddDepartmentFromPlatformDto)
  data: AddDepartmentFromPlatformDto;
}

class OrganizationTreeWithContextRpcDto extends OrganizationTreeRpcDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationActorDto)
  actor?: OrganizationActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class OrganizationNodeIdWithContextDto extends OrganizationNodeIdDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationActorDto)
  actor?: OrganizationActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class OrganizationRoomOrgSnapshotRpcDto extends OrganizationBaseRpcContextDto {
  @IsUUID()
  roomId: string;
}

class OrganizationNodeAgentsRpcDto extends OrganizationNodeIdWithContextDto {
  @IsOptional()
  @IsBoolean()
  includeSelf?: boolean;
}

class OrganizationNodeGetRpcDto extends OrganizationNodeIdWithContextDto {}

class OrganizationNodeBindSkillsRpcDto extends OrganizationBaseRpcContextDto {
  @ValidateNested()
  @Type(() => OrganizationActorDto)
  actor: OrganizationActorDto;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => BindOrganizationNodeSkillsDto)
  data: BindOrganizationNodeSkillsDto;
}

class OrganizationAuditRpcDto extends OrganizationBaseRpcContextDto {
  @IsOptional()
  @IsUUID()
  nodeId?: string;

  @IsOptional()
  @IsIn(['create', 'update', 'move', 'delete'])
  action?: 'create' | 'update' | 'move' | 'delete';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

@Controller()
export class OrganizationRpcController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly organizationNodeSkillsService: OrganizationNodeSkillsService,
    private readonly memoryKnowledge: MemoryKnowledgeService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @MessagePattern('organization.tree')
  async tree(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationTreeWithContextRpcDto, payload);
      return await this.runWithCompanyContext(dto, () => this.organizationService.getTree(dto));
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.nodes.getRoomOrgSnapshot')
  async getRoomOrgSnapshot(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationRoomOrgSnapshotRpcDto, payload);
      return await this.runWithCompanyContext(dto, () => this.organizationService.getRoomOrgSnapshot(dto.roomId));
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.node.create')
  async create(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationCreateNodeRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.organizationService.createNode(dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.department.addFromPlatform')
  async addDepartmentFromPlatform(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationAddDepartmentFromPlatformRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.organizationService.addDepartmentFromPlatform(dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.node.update')
  async update(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationUpdateNodeRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.organizationService.updateNode(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.node.move')
  async move(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationMoveNodeRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.organizationService.moveNode(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.node.remove')
  async remove(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationNodeIdWithContextDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.organizationService.removeNode(dto.id, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.node.get')
  async get(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationNodeGetRpcDto, payload);
      return await this.runWithCompanyContext(dto, async () => {
        const node = await this.organizationService.findNodeByIdForTenant(dto.id);
        return { id: node.id, type: node.type };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.node.agents')
  async agents(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationNodeAgentsRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.organizationService.findDescendantAgents(dto.id, dto.includeSelf ?? true),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.node.reportingChain')
  async reportingChain(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationNodeIdWithContextDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.organizationService.getReportingChain(dto.id),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.node.skills.list')
  async nodeSkillsList(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationNodeIdWithContextDto, payload);
      return await this.runWithCompanyContext(dto, async () => {
        const skillIds = await this.organizationNodeSkillsService.listSkillIdsForNode(dto.id);
        return { skillIds };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.node.skills.bind')
  async nodeSkillsBind(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationNodeBindSkillsRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.organizationNodeSkillsService.bindSkills(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.node.skills.unbind')
  async nodeSkillsUnbind(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationNodeBindSkillsRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.organizationNodeSkillsService.unbindSkills(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.node.knowledgeSummary')
  async knowledgeSummary(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationNodeIdWithContextDto, payload);
      return await this.runWithCompanyContext(dto, async () => {
        const node = await this.organizationService.findNodeByIdForTenant(dto.id);
        if (node.type !== 'department') {
          return {
            summary: '',
            hits: 0,
            notice: '仅部门节点返回部门知识摘要',
          };
        }
        return this.memoryKnowledge.getDepartmentKnowledgeSummary({
          companyId: node.companyId,
          organizationNodeId: node.id,
          nodeName: node.name,
          actor: dto.actor,
        });
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('organization.audit.logs')
  async auditLogs(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(OrganizationAuditRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.organizationService.queryAuditLogs(dto),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private toRpcError(e: any): RpcException {
    if (e?.getStatus && e?.getResponse) {
      return new RpcException({
        status: e.getStatus(),
        response: e.getResponse(),
        message: e.message,
      });
    }
    return e instanceof RpcException
      ? e
      : new RpcException({ status: 500, message: e?.message || 'Internal error' });
  }

  private runWithCompanyContext<T>(
    payload: { companyId?: string; actor?: { companyId?: string } },
    callback: () => Promise<T>,
  ): Promise<T> {
    const companyId = payload?.companyId || payload?.actor?.companyId;
    if (!companyId) {
      return callback();
    }
    return this.tenantContext.runWithCompanyId(companyId, callback);
  }
}
