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
import { isAuthorized } from '../../common/authz/authorization.js';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { TenantContextService } from '@service/tenant';
import { ApprovalService } from './services/approval.service.js';

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
  tokenId: string;

  @IsString()
  action: string;
}

/** 审批通过签发的 token + 配置 patch（action 固定为 config.apply） */
class ApprovalApplyGatedRpcDto extends CompanyRpcDto {
  @IsUUID()
  tokenId: string;

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

const ADMIN_ROLES = ['admin', 'owner'] as const;

function assertApprover(actor: ActorDto | undefined): void {
  if (isAuthorized(actor, { anyRoles: [...ADMIN_ROLES] })) return;
  throw new RpcException({
    status: 403,
    message: 'Insufficient permissions for approval actions',
  });
}

@Controller()
export class ApprovalRpcController {
  private readonly logger = new Logger(ApprovalRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly approval: ApprovalService,
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

  @MessagePattern('approval.approve')
  async approve(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalApproveRpcDto, payload);
      assertApprover(dto.actor);
      return await executeRpc({
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
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('approval.reject')
  async reject(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ApprovalRejectRpcDto, payload);
      assertApprover(dto.actor);
      return await executeRpc({
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
              tokenId: dto.tokenId,
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
              tokenId: dto.tokenId,
              action: dto.action,
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
