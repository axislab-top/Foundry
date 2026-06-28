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
import { SkillBindingValidatorService } from './services/skill-binding-validator.service.js';
import { SkillUsageAnalyticsService } from './services/skill-usage-analytics.service.js';
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

class SkillsRevisionDiffRpcDto extends SkillsFindOneRpcDto {
  @IsUUID()
  fromRevisionId: string;

  @IsUUID()
  toRevisionId: string;
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

class ResolveRequiredGlobalSkillIdsByNamesDto extends ResolveGlobalSkillIdsByNamesDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  errorPrefix?: string;
}

class SkillsValidateCompanyBindingsRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsArray()
  @IsString({ each: true })
  skillIds: string[];
}

class SkillsAnalyticsUsageRpcDto extends SkillsBaseRpcDto {
  @IsOptional()
  @IsString()
  @IsIn(['24h', '7d', '30d'])
  period?: '24h' | '7d' | '30d';
}

@Controller()
export class SkillsRpcController {
  private readonly logger = new Logger(SkillsRpcController.name);

  constructor(
    private readonly skillsService: SkillsService,
    private readonly tenantContext: TenantContextService,
    private readonly skillBindingValidator: SkillBindingValidatorService,
    private readonly analyticsService: SkillUsageAnalyticsService,
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

  @MessagePattern('skills.revisions.diff')
  async revisionDiff(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsRevisionDiffRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.skillsService.getRevisionDiff(dto.id, dto.fromRevisionId, dto.toRevisionId),
      );
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

  @MessagePattern('skills.validateCompanyBindings')
  async validateCompanyBindings(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(SkillsValidateCompanyBindingsRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.validateCompanyBindings',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.skillBindingValidator.validateSkillsBelongToCompany(dto.companyId, dto.skillIds, {
              operatorId: dto.actor.id,
              source: 'skills.validateCompanyBindings.rpc',
            }),
          ).then(() => ({ ok: true as const })),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.analytics.usage')
  async analyticsUsage(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(SkillsAnalyticsUsageRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.analytics.usage',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.runWithCompanyContext(dto, () =>
            this.analyticsService.getSkillUsageStats(dto.companyId!, dto.period ?? '7d'),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.analytics.dependencyGraph')
  async analyticsDependencyGraph(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(SkillsBaseRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.analytics.dependencyGraph',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.runWithCompanyContext(dto, () =>
            this.analyticsService.getSkillDependencyGraph(dto.companyId!),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.analytics.anomalies')
  async analyticsAnomalies(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(SkillsBaseRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.analytics.anomalies',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.runWithCompanyContext(dto, () =>
            this.analyticsService.detectHighUsageAnomaly(dto.companyId!),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.resolveRequiredGlobalSkillIdsByNames')
  async resolveRequiredGlobalSkillIdsByNames(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(ResolveRequiredGlobalSkillIdsByNamesDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'skills.resolveRequiredGlobalSkillIdsByNames',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.skillsService.resolveRequiredGlobalSkillIdsByNames(dto.names, {
            source: dto.source,
            errorPrefix: dto.errorPrefix,
          }),
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
