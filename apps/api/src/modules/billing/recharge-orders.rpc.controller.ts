import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { isAuthorized } from '../../common/authz/authorization.js';
import { TenantContextService } from '@service/tenant';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { CreateBillingRechargeOrderDto } from './dto/create-billing-recharge-order.dto.js';
import { QueryBillingRechargeOrdersDto } from './dto/query-billing-recharge-orders.dto.js';
import { RechargeOrdersService } from './services/recharge-orders.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsString({ each: true })
  permissions?: string[];
}

/** 任意已登录成员可发起充值申请、查看本公司订单（RLS + tenant 仍约束 company） */
function assertAuthenticatedActor(actor: ActorDto | undefined): void {
  if (actor?.id) return;
  throw new RpcException({
    status: 401,
    message: 'Authentication required for recharge orders',
  });
}

const RECHARGE_ORDER_REVIEW_ROLES = ['admin', 'owner', 'superadmin'] as const;

function assertRechargeOrderReviewer(actor: ActorDto | undefined): void {
  if (isAuthorized(actor, { anyRoles: [...RECHARGE_ORDER_REVIEW_ROLES] })) return;
  throw new RpcException({
    status: 403,
    message: 'Only company admin, owner, or superadmin can approve or reject recharge orders',
  });
}

class CompanyRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class RechargeOrdersListRpcDto extends CompanyRpcDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => QueryBillingRechargeOrdersDto)
  query?: QueryBillingRechargeOrdersDto;
}

class RechargeOrdersCreateRpcDto extends CompanyRpcDto {
  @ValidateNested()
  @Type(() => CreateBillingRechargeOrderDto)
  data: CreateBillingRechargeOrderDto;
}

class RechargeOrderIdRpcDto extends CompanyRpcDto {
  @IsUUID()
  orderId: string;
}

class RechargeOrderRejectRpcDto extends RechargeOrderIdRpcDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectReason?: string;
}

@Controller()
export class RechargeOrdersRpcController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly rechargeOrders: RechargeOrdersService,
  ) {}

  @MessagePattern('billing.rechargeOrders.list')
  async list(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(RechargeOrdersListRpcDto, payload);
      assertAuthenticatedActor(dto.actor);
      return await this.runWithCompany(dto.companyId, () =>
        this.rechargeOrders.list(dto.companyId, dto.query ?? ({} as QueryBillingRechargeOrdersDto)),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.rechargeOrders.create')
  async create(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(RechargeOrdersCreateRpcDto, payload);
      assertAuthenticatedActor(dto.actor);
      return await this.runWithCompany(dto.companyId, () =>
        this.rechargeOrders.create(dto.companyId, dto.data, dto.actor.id),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.rechargeOrders.approve')
  async approve(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(RechargeOrderIdRpcDto, payload);
      assertRechargeOrderReviewer(dto.actor);
      return await this.runWithCompany(dto.companyId, () =>
        this.rechargeOrders.approve(dto.companyId, dto.orderId, dto.actor.id),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.rechargeOrders.reject')
  async reject(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(RechargeOrderRejectRpcDto, payload);
      assertRechargeOrderReviewer(dto.actor);
      return await this.runWithCompany(dto.companyId, () =>
        this.rechargeOrders.reject(
          dto.companyId,
          dto.orderId,
          dto.actor.id,
          dto.rejectReason,
        ),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  private runWithCompany<T>(companyId: string, fn: () => Promise<T>) {
    return this.tenantContext.runWithCompanyId(companyId, fn);
  }

  private toRpcError(e: unknown): RpcException {
    if (e instanceof RpcException) return e;
    const err = e as { status?: number; message?: string; response?: { message?: string } };
    const status = typeof err?.status === 'number' ? err.status : 500;
    return new RpcException({
      status,
      message: err?.response?.message ?? err?.message ?? 'Internal error',
    });
  }
}
