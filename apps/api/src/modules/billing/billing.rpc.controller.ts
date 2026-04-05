import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { isAuthorized } from '../../common/authz/authorization.js';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  Min,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { BudgetExhaustedError } from './errors/budget-exhausted.error.js';
import { TenantContextService } from '@service/tenant';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { AppendBillingRecordDto } from './dto/append-billing-record.dto.js';
import { QueryBillingRecordsDto } from './dto/query-billing-records.dto.js';
import { UpdateBillingSettingsDto } from './dto/update-billing-settings.dto.js';
import { UpsertBudgetDto } from './dto/upsert-budget.dto.js';
import { BillingService } from './services/billing.service.js';
import { BudgetService } from './services/budget.service.js';
import { DashboardBillingService } from './services/dashboard-billing.service.js';
import { ModelRouterService } from './services/model-router.service.js';
import type { AgentRole } from '../agents/entities/agent.entity.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

const BILLING_ADMIN_ROLES = ['admin', 'owner'] as const;

function assertBillingAdmin(actor: ActorDto | undefined): void {
  if (isAuthorized(actor, { anyRoles: [...BILLING_ADMIN_ROLES] })) return;
  throw new RpcException({
    status: 403,
    message: 'Insufficient permissions for billing administration',
  });
}

function assertCanQueryBillingRecords(
  actor: ActorDto | undefined,
  query: QueryBillingRecordsDto,
): void {
  if (isAuthorized(actor, { anyRoles: [...BILLING_ADMIN_ROLES] })) return;
  if (query.agentId) return;
  throw new RpcException({
    status: 403,
    message: 'Provide agentId to scope billing records, or use an admin role',
  });
}

class CompanyRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class BillingRecordsQueryRpcDto extends CompanyRpcDto {
  @ValidateNested()
  @Type(() => QueryBillingRecordsDto)
  query: QueryBillingRecordsDto;
}

class BillingAppendRpcDto extends CompanyRpcDto {
  @ValidateNested()
  @Type(() => AppendBillingRecordDto)
  data: AppendBillingRecordDto;
}

class BudgetUpsertRpcDto extends CompanyRpcDto {
  @ValidateNested()
  @Type(() => UpsertBudgetDto)
  data: UpsertBudgetDto;
}

class BillingSettingsUpdateRpcDto extends CompanyRpcDto {
  @ValidateNested()
  @Type(() => UpdateBillingSettingsDto)
  data: UpdateBillingSettingsDto;
}

class ModelRouterResolveRpcDto extends CompanyRpcDto {
  @IsIn(['ceo', 'director', 'board_member', 'executor'])
  agentRole: AgentRole;

  @IsOptional()
  @IsString()
  agentPreferredModel?: string;

  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  taskPriority?: 'low' | 'normal' | 'high' | 'urgent';
}

class BillingAllowanceRpcDto extends CompanyRpcDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  runId?: string;
}

@Controller()
export class BillingRpcController {
  private readonly logger = new Logger(BillingRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly billing: BillingService,
    private readonly budget: BudgetService,
    private readonly dashboard: DashboardBillingService,
    private readonly modelRouter: ModelRouterService,
  ) {}

  @MessagePattern('billing.records.list')
  async listRecords(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(BillingRecordsQueryRpcDto, payload);
      assertCanQueryBillingRecords(dto.actor, dto.query);
      return await this.runWithCompany(dto.companyId, () =>
        this.billing.queryRecords(dto.companyId, dto.query),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.record.append')
  async appendRecord(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(BillingAppendRpcDto, payload);
      assertBillingAdmin(dto.actor);
      return await this.runWithCompany(dto.companyId, () =>
        this.billing.appendRecord(dto.companyId, dto.data),
      );
    } catch (e: unknown) {
      if (e instanceof BudgetExhaustedError) {
        throw new RpcException({
          status: 409,
          message: e.message,
          code: e.code,
        });
      }
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.budgets.list')
  async listBudgets(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CompanyRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.budget.listBudgets(dto.companyId),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.budget.upsert')
  async upsertBudget(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(BudgetUpsertRpcDto, payload);
      assertBillingAdmin(dto.actor);
      return await this.runWithCompany(dto.companyId, () =>
        this.budget.upsertBudget(dto.companyId, dto.data),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.settings.get')
  async getSettings(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CompanyRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.modelRouter.getSettings(dto.companyId),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.settings.update')
  async updateSettings(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(BillingSettingsUpdateRpcDto, payload);
      assertBillingAdmin(dto.actor);
      return await this.runWithCompany(dto.companyId, () =>
        this.modelRouter.upsertSettings(dto.companyId, dto.data),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.modelRouter.resolve')
  async resolveModel(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ModelRouterResolveRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.modelRouter.resolveModel({
          companyId: dto.companyId,
          agentRole: dto.agentRole,
          agentPreferredModel: dto.agentPreferredModel,
          taskPriority: dto.taskPriority,
        }),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.checkAllowance')
  async checkAllowance(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(BillingAllowanceRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.billing.checkAllowance(dto.companyId, dto.estimatedCost ?? 0, {
          agentId: dto.agentId,
          departmentId: dto.departmentId,
          runId: dto.runId,
        }),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('dashboard.billingSummary')
  async billingSummary(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CompanyRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'dashboard.billingSummary',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.runWithCompany(dto.companyId, () =>
            this.dashboard.getSummary(dto.companyId),
          ),
      });
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.signals.refresh')
  async refreshSignals(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CompanyRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.billing.refreshBudgetSignals(dto.companyId),
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
