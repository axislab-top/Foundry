import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { CreateSkillDto } from './dto/create-skill.dto.js';
import { QuerySkillsDto } from './dto/query-skills.dto.js';
import { UpdateSkillDto } from './dto/update-skill.dto.js';
import { SkillsService } from './services/skills.service.js';
import { SkillsAdminService } from './services/skills-admin.service.js';
import { TenantContextService } from '@service/tenant';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  roles?: string[];
}

class SkillsBaseRpcDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ActorDto)
  actor?: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class SkillsFindOneRpcDto extends SkillsBaseRpcDto {
  @IsUUID()
  id: string;
}

class SkillsRevisionPublishRpcDto extends SkillsFindOneRpcDto {
  @IsUUID()
  revisionId: string;
}

class SkillsRevisionReviewRpcDto extends SkillsRevisionPublishRpcDto {
  @IsString()
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  comment?: string;
}

class SkillsCreateRpcDto extends SkillsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => CreateSkillDto)
  data: CreateSkillDto;
}

class SkillsUpdateRpcDto extends SkillsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateSkillDto)
  data: UpdateSkillDto;
}

class SkillsRemoveRpcDto extends SkillsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class SkillsFindAllRpcDto extends QuerySkillsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ActorDto)
  actor?: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class GlobalSkillsAdminQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

class GlobalSkillsAdminFindAllDto extends GlobalSkillsAdminQueryDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class GlobalSkillsAdminFindOneDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class GlobalSkillsAdminCreateDto extends SkillsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => CreateSkillDto)
  data: CreateSkillDto;
}

class GlobalSkillsAdminUpdateDto extends SkillsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateSkillDto)
  data: UpdateSkillDto;
}

class GlobalSkillsAdminRemoveDto extends SkillsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class GlobalSkillsAdminUsageStatsDto {
  @IsOptional()
  @IsUUID()
  skillId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

class GlobalSkillsAdminUsageStatsRpcDto extends GlobalSkillsAdminUsageStatsDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class GlobalSkillsAdminAuditLogsDto {
  @IsOptional()
  @IsUUID()
  skillId?: string;

  @IsOptional()
  @IsString()
  actionType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

class GlobalSkillsAdminAuditLogsRpcDto extends GlobalSkillsAdminAuditLogsDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class GlobalSkillsAdminSkillIdDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class GlobalSkillsAdminPublishRevisionDto extends GlobalSkillsAdminSkillIdDto {
  @IsUUID()
  revisionId: string;
}

class GlobalSkillsAdminReviewRevisionDto extends GlobalSkillsAdminPublishRevisionDto {
  @IsString()
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  comment?: string;
}

class ResolveGlobalSkillIdsByNamesDto {
  @IsArray()
  @IsString({ each: true })
  names: string[];
}

@Controller()
export class SkillsRpcController {
  private readonly logger = new Logger(SkillsRpcController.name);

  constructor(
    private readonly skillsService: SkillsService,
    private readonly tenantContext: TenantContextService,
    private readonly skillsAdminService: SkillsAdminService,
  ) {}

  @MessagePattern('skills.findAll')
  async findAll(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsFindAllRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.findAll',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.runWithCompanyContext(dto, () => this.skillsService.findAll(dto)),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.findOne')
  async findOne(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsFindOneRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.findOne',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.runWithCompanyContext(dto, () => this.skillsService.findOne(dto.id)),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.create')
  async create(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsCreateRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.skillsService.create(dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.update')
  async update(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsUpdateRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.skillsService.update(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.remove')
  async remove(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsRemoveRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.skillsService.remove(dto.id, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.revisions.list')
  async revisions(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsFindOneRpcDto, payload);
      return await this.runWithCompanyContext(dto, () => this.skillsService.listRevisionsForTenant(dto.id));
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.revisions.importFromArtifact')
  async importRevision(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsFindOneRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.skillsService.importRevisionFromArtifactForTenant(dto.id, dto.actor!),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.revisions.publish')
  async publishRevision(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsRevisionPublishRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.skillsService.publishRevisionForTenant(dto.id, dto.revisionId, dto.actor!),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.revisions.review')
  async reviewRevision(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsRevisionReviewRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.skillsService.reviewRevisionForTenant(dto.id, dto.revisionId, dto.actor!, {
          action: dto.action,
          comment: dto.comment,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.revisions.revoke')
  async revokeRevision(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsRevisionPublishRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.skillsService.revokeRevisionForTenant(dto.id, dto.revisionId, dto.actor!),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.revisions.rollback')
  async rollbackRevision(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsRevisionPublishRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.skillsService.rollbackRevisionForTenant(dto.id, dto.revisionId, dto.actor!),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.resolveGlobalSkillIdsByNames')
  async resolveGlobalSkillIdsByNames(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(ResolveGlobalSkillIdsByNamesDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.resolveGlobalSkillIdsByNames',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.skillsService.findGlobalSkillIdsByNames(dto.names),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.findAll')
  async adminGlobalFindAll(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminFindAllDto, payload);
      const actor = { id: dto.actor.id, roles: dto.actor.roles };
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.findAll',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.skillsAdminService.findGlobalAll({
            search: dto.search,
            category: dto.category,
            page: dto.page,
            pageSize: dto.pageSize,
          }, actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.findOne')
  async adminGlobalFindOne(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminFindOneDto, payload);
      const actor = { id: dto.actor.id, roles: dto.actor.roles };
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.findOne',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.skillsAdminService.findGlobalOne(dto.id, actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.create')
  async adminGlobalCreate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminCreateDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.create',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.skillsAdminService.createGlobal(dto.data, { id: dto.actor.id, roles: dto.actor.roles }),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.update')
  async adminGlobalUpdate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminUpdateDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.update',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.skillsAdminService.updateGlobal(dto.id, dto.data, {
            id: dto.actor.id,
            roles: dto.actor.roles,
          }),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.remove')
  async adminGlobalRemove(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminRemoveDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.remove',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.skillsAdminService.removeGlobal(dto.id, { id: dto.actor.id, roles: dto.actor.roles }),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.usageStats')
  async adminGlobalUsageStats(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminUsageStatsRpcDto, payload);
      const actor = { id: dto.actor.id, roles: dto.actor.roles };
      // Service handles permission checks.
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.usageStats',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.skillsAdminService.usageStatsGlobal({
            skillId: dto.skillId,
            startDate: dto.startDate,
            endDate: dto.endDate,
            page: dto.page,
            pageSize: dto.pageSize,
          }, actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.auditLogs')
  async adminGlobalAuditLogs(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminAuditLogsRpcDto, payload);
      const actor = { id: dto.actor.id, roles: dto.actor.roles };
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.auditLogs',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.skillsAdminService.auditLogsGlobal({
            skillId: dto.skillId,
            actionType: dto.actionType,
            page: dto.page,
            pageSize: dto.pageSize,
          }, actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.revisions.list')
  async adminGlobalRevisionsList(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminSkillIdDto, payload);
      const actor = { id: dto.actor.id, roles: dto.actor.roles };
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.revisions.list',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.skillsAdminService.listRevisionsGlobal(dto.id, actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.revisions.importFromArtifact')
  async adminGlobalRevisionsImport(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminSkillIdDto, payload);
      const actor = { id: dto.actor.id, roles: dto.actor.roles };
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.revisions.importFromArtifact',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 60000),
        handler: () => this.skillsAdminService.importRevisionFromArtifactGlobal(dto.id, actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.revisions.publish')
  async adminGlobalRevisionsPublish(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminPublishRevisionDto, payload);
      const actor = { id: dto.actor.id, roles: dto.actor.roles };
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.revisions.publish',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.skillsAdminService.publishRevisionGlobal(dto.id, dto.revisionId, actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.revisions.review')
  async adminGlobalRevisionsReview(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminReviewRevisionDto, payload);
      const actor = { id: dto.actor.id, roles: dto.actor.roles };
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.revisions.review',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.skillsAdminService.reviewRevisionGlobal(dto.id, dto.revisionId, actor, {
            action: dto.action,
            comment: dto.comment,
          }),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.revisions.revoke')
  async adminGlobalRevisionsRevoke(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminPublishRevisionDto, payload);
      const actor = { id: dto.actor.id, roles: dto.actor.roles };
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.revisions.revoke',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.skillsAdminService.revokeRevisionGlobal(dto.id, dto.revisionId, actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.admin.global.revisions.rollback')
  async adminGlobalRevisionsRollback(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(GlobalSkillsAdminPublishRevisionDto, payload);
      const actor = { id: dto.actor.id, roles: dto.actor.roles };
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.admin.global.revisions.rollback',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.skillsAdminService.rollbackRevisionGlobal(dto.id, dto.revisionId, actor),
      });
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
    payload: { companyId?: string; actor?: { id: string } },
    callback: () => Promise<T>,
  ): Promise<T> {
    const companyId = payload?.companyId;
    if (!companyId) {
      return callback();
    }
    return this.tenantContext.runWithCompanyId(companyId, callback);
  }
}
