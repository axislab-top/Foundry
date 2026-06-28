import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { ApprovalListScope } from './services/approval.service.js';
import { isAuthorized } from '../../common/authz/authorization.js';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { TenantContextService } from '@service/tenant';
import { ApprovalService } from './services/approval.service.js';
import { ApprovalResultPubSubService } from './services/approval-result-pubsub.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class CompanyRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class ApprovalCreateRpcDto extends CompanyRpcDto {
  @IsString()
  actionType: string;

  @IsOptional()
  @IsIn(['L0', 'L1', 'L2', 'L3'])
  riskLevel?: string;

  @IsOptional()
  context?: Record<string, unknown> | null;
}

class ApprovalIdRpcDto extends CompanyRpcDto {
  @IsUUID()
  approvalId: string;
}

class ApprovalApproveRpcDto extends ApprovalIdRpcDto {
  @IsString()
  action: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(120)
  ttlMinutes?: number;
}

class ApprovalRejectRpcDto extends ApprovalIdRpcDto {
  @IsOptional()
  @IsString()
  reason?: string | null;
}

class ApprovalConsumeRpcDto extends CompanyRpcDto {
  @IsUUID()
  executionTokenId: string;

  @IsString()
  action: string;

  /** 与 `approval_execution_tokens.skill_slug` 绑定消费（Runner `runner.skill.execute` 必传） */
  @IsOptional()
  @IsString()
  skillSlug?: string;
}

/** P12：在已批准的 `runner.exec` ApprovalRequest 背书下签发 skill 绑定令牌（5min） */
class ApprovalCreateExecutionTokenRpcDto extends CompanyRpcDto {
  @IsUUID()
  approvalRequestId: string;

  @IsString()
  skillSlug: string;

  @IsOptional()
  context?: Record<string, unknown> | null;
}

/** 审批通过签发的 token + 配置 patch（action 固定为 config.apply） */
class ApprovalApplyGatedRpcDto extends CompanyRpcDto {
  @IsUUID()
  executionTokenId: string;

  @IsObject()
  patch: Record<string, unknown>;
}

class ApprovalListRpcDto extends CompanyRpcDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

class ApprovalListFilterRpcDto extends CompanyRpcDto {
  @IsOptional()
  @IsIn(['pending', 'resolved_mine', 'company_all'])
  scope: ApprovalListScope;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  /** 逗号分隔状态，仅 scope=company_all 时有效 */
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsIn(['L0', 'L1', 'L2', 'L3'])
  riskLevel?: string;

  @IsOptional()
  @IsIn(['all', 'high', 'medium'])
  riskBand?: 'all' | 'high' | 'medium';

  @IsOptional()
  @IsString()
  actionTypePrefix?: string;

  /** 逗号分隔 actionType 前缀，支持 __other__ */
  @IsOptional()
  @IsString()
  actionType?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  createdAfter?: string;

  @IsOptional()
  @IsString()
  createdBefore?: string;

  @IsOptional()
  @IsString()
  resolvedAfter?: string;

  @IsOptional()
  @IsString()
  resolvedBefore?: string;
}

class ApprovalStatsRpcDto extends CompanyRpcDto {}

const ADMIN_ROLES = ['admin', 'owner'] as const;

const RUNNER_TOKEN_MINT_ROLES = ['admin', 'owner', 'system'] as const;

function assertApprover(actor: ActorDto | undefined): void {
  if (isAuthorized(actor, { anyRoles: [...ADMIN_ROLES] })) return;
  throw new RpcException({
    status: 403,
    message: 'Insufficient permissions for approval actions',
  });
}

function assertRunnerExecTokenMinter(actor: ActorDto | undefined): void {
  if (isAuthorized(actor, { anyRoles: [...RUNNER_TOKEN_MINT_ROLES] })) return;
  throw new RpcException({
    status: 403,
    message: 'Insufficient permissions to mint runner execution token',
  });
}

@Controller()
export class ApprovalRpcController {
  private readonly logger = new Logger(ApprovalRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly approval: ApprovalService,
    private readonly approvalResultPubSub: ApprovalResultPubSubService,
  ) {}

  @MessagePattern('approval.create')
  async create(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalCreateRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'approval.create',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.approval.create(dto.companyId, {
              actionType: dto.actionType,
              riskLevel: dto.riskLevel,
              context: dto.context ?? null,
              createdBy: dto.actor.id,
            }),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('approval.listPending')
  async listPending(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalListRpcDto, payload);
      assertApprover(dto.actor);
      return await executeRpc({
        logger: this.logger,
        pattern: 'approval.listPending',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.approval.listPending(dto.companyId, dto.limit ?? 50),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('approval.findOne')
  async findOne(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalIdRpcDto, payload);
      assertApprover(dto.actor);
      return await executeRpc({
        logger: this.logger,
        pattern: 'approval.findOne',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.approval.findOne(dto.companyId, dto.approvalId),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('approval.list')
  async list(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalListFilterRpcDto, payload);
      assertApprover(dto.actor);
      return await executeRpc({
        logger: this.logger,
        pattern: 'approval.list',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.approval.listFiltered({
              companyId: dto.companyId,
              actorId: dto.actor.id,
              scope: dto.scope ?? 'pending',
              limit: dto.limit ?? 30,
              cursor: dto.cursor ?? null,
              statusCsv: dto.status ?? null,
              riskLevel: dto.riskLevel ?? null,
              riskBand: dto.riskBand === 'high' || dto.riskBand === 'medium' ? dto.riskBand : null,
              actionTypePrefix: dto.actionTypePrefix ?? null,
              actionTypeCsv: dto.actionType ?? null,
              q: dto.q ?? null,
              createdAfter: dto.createdAfter ?? null,
              createdBefore: dto.createdBefore ?? null,
              resolvedAfter: dto.resolvedAfter ?? null,
              resolvedBefore: dto.resolvedBefore ?? null,
            }),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('approval.stats')
  async stats(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalStatsRpcDto, payload);
      assertApprover(dto.actor);
      return await executeRpc({
        logger: this.logger,
        pattern: 'approval.stats',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.approval.weeklyStats(dto.companyId),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('approval.approve')
  async approve(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalApproveRpcDto, payload);
      assertApprover(dto.actor);
      const out = await executeRpc({
        logger: this.logger,
        pattern: 'approval.approve',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.approval.approve({
              companyId: dto.companyId,
              approvalId: dto.approvalId,
              actorId: dto.actor.id,
              action: dto.action,
              ttlMinutes: dto.ttlMinutes,
            }),
          ),
      });
      await this.approvalResultPubSub.publishApprovalResult(
        dto.companyId,
        dto.approvalId,
        true,
      );
      return out;
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('approval.reject')
  async reject(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalRejectRpcDto, payload);
      assertApprover(dto.actor);
      const out = await executeRpc({
        logger: this.logger,
        pattern: 'approval.reject',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.approval.reject({
              companyId: dto.companyId,
              approvalId: dto.approvalId,
              actorId: dto.actor.id,
              reason: dto.reason,
            }),
          ),
      });
      await this.approvalResultPubSub.publishApprovalResult(
        dto.companyId,
        dto.approvalId,
        false,
      );
      return out;
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('approval.applyGatedConfig')
  async applyGatedConfig(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalApplyGatedRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'approval.applyGatedConfig',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.approval.applyGatedConfigPatch({
              companyId: dto.companyId,
              executionTokenId: dto.executionTokenId,
              patch: dto.patch,
            }),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('approval.consumeExecutionToken')
  async consumeExecutionToken(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalConsumeRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'approval.consumeExecutionToken',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.approval.consumeExecutionToken({
              companyId: dto.companyId,
              executionTokenId: dto.executionTokenId,
              action: dto.action,
              skillSlug: dto.skillSlug ?? null,
            }),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('approval.createExecutionToken')
  async createExecutionToken(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalCreateExecutionTokenRpcDto, payload);
      assertRunnerExecTokenMinter(dto.actor);
      return await executeRpc({
        logger: this.logger,
        pattern: 'approval.createExecutionToken',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.approval.createExecutionToken({
              companyId: dto.companyId,
              actorId: dto.actor.id,
              approvalRequestId: dto.approvalRequestId,
              skillSlug: dto.skillSlug,
              context: dto.context ?? null,
            }),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private toRpcError(e: any): RpcException {
    if (e instanceof RpcException) return e;
    const status = typeof e?.status === 'number' ? e.status : 500;
    this.logger.warn(e?.message ?? String(e));
    return new RpcException({
      status,
      message: e?.response?.message ?? e?.message ?? 'Internal error',
    });
  }
}
