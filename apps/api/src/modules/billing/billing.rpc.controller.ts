import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { isAuthorized } from '../../common/authz/authorization.js';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Min,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { TenantContextService } from '@service/tenant';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { AppendBillingRecordDto } from './dto/append-billing-record.dto.js';
import { QueryBillingRecordsDto } from './dto/query-billing-records.dto.js';
import { QueryAgentDailyUsageDto } from './dto/query-agent-daily-usage.dto.js';
import { UpdateBillingSettingsDto } from './dto/update-billing-settings.dto.js';
import { UpsertBudgetDto } from './dto/upsert-budget.dto.js';
import { BillingService } from './services/billing.service.js';
import { BudgetService } from './services/budget.service.js';
import { DashboardBillingService } from './services/dashboard-billing.service.js';
import { ModelRouterService } from './services/model-router.service.js';
import { AgentLlmPricingSnapshotService } from './services/agent-llm-pricing-snapshot.service.js';
import { AgentUsageService } from './services/agent-usage.service.js';
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

const BILLING_RECORDS_QUERY_PRIVILEGED_ROLES = [
  ...BILLING_ADMIN_ROLES,
  'superadmin',
] as const;

function assertCanQueryBillingRecords(
  actor: ActorDto | undefined,
  query: QueryBillingRecordsDto,
): void {
  if (isAuthorized(actor, { anyRoles: [...BILLING_RECORDS_QUERY_PRIVILEGED_ROLES] })) return;
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

class AgentLlmPricingSnapshotRpcDto extends CompanyRpcDto {
  @IsUUID()
  agentId: string;
}

class DailyAgentUsageGetRpcDto extends CompanyRpcDto {
  @IsUUID()
  agentId: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD (UTC)' })
  date?: string;
}

class CompanyAgentUsageListRpcDto extends CompanyRpcDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD (UTC)' })
  date?: string;
}

class AgentDailyUsageRangeRpcDto extends CompanyRpcDto {
  @ValidateNested()
  @Type(() => QueryAgentDailyUsageDto)
  query: QueryAgentDailyUsageDto;
}

class CostTrendGetRpcDto extends CompanyRpcDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;
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
    private readonly agentLlmSnapshot: AgentLlmPricingSnapshotService,
    private readonly agentUsage: AgentUsageService,
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
      const normalized = {
        ...dto.data,
        ceoDecisionModel:
          dto.data.ceoDecisionModel !== undefined
            ? dto.data.ceoDecisionModel.trim() || null
            : undefined,
        ceoDecisionLlmKeyId:
          dto.data.ceoDecisionLlmKeyId !== undefined ? dto.data.ceoDecisionLlmKeyId : undefined,
        agentUsageAggregateIntervalMinutes:
          dto.data.agentUsageAggregateIntervalMinutes !== undefined
            ? dto.data.agentUsageAggregateIntervalMinutes
            : undefined,
      };
      return await this.runWithCompany(dto.companyId, async () => {
        const settings = await this.modelRouter.upsertSettings(dto.companyId, normalized);
        const envInterval = Number.parseInt(process.env.AGENT_USAGE_AGGREGATE_INTERVAL_MINUTES ?? '10', 10);
        const fallbackInterval = Number.isFinite(envInterval) && envInterval > 0 ? envInterval : 10;
        return {
          settings,
          aggregationIntervalMinutes: settings.agentUsageAggregateIntervalMinutes ?? fallbackInterval,
        };
      });
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

  /** Worker: resolve current model_pricing as snapshot JSON for employee LLM billing (live catalog rates). */
  @MessagePattern('billing.agentLlmPricingSnapshot')
  async agentLlmPricingSnapshot(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(AgentLlmPricingSnapshotRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.agentLlmSnapshot.getForAgent(dto.companyId, dto.agentId),
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

  @MessagePattern('billing.agentUsage.getDaily')
  async getDailyAgentUsage(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(DailyAgentUsageGetRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.agentUsage.getDailyUsage(dto.companyId, dto.agentId, dto.date),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  /** 公司内全部 Agent 员工在指定 UTC 日的用量列表（含当日无消耗的 Agent，cost/token 为 0）。 */
  @MessagePattern('billing.agentUsage.listCompanyDaily')
  async listCompanyDailyAgentUsage(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CompanyAgentUsageListRpcDto, payload);
      const day = dto.date?.trim() || new Date().toISOString().slice(0, 10);
      return await this.runWithCompany(dto.companyId, () =>
        this.agentUsage.listCompanyAgentsDailyUsage(dto.companyId, day),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  /** 按 UTC 日期范围列出有消费的 Agent-日用量明细。 */
  @MessagePattern('billing.agentUsage.listRange')
  async listAgentDailyUsageRange(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(AgentDailyUsageRangeRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.agentUsage.listAgentDailyUsageRange(dto.companyId, dto.query),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  /** 按 UTC 日历日聚合费用趋势（最多 90 天）。 */
  @MessagePattern('billing.costTrend.get')
  async getCostTrend(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CostTrendGetRpcDto, payload);
      const daysRaw = dto.days ?? 7;
      const days = Math.min(90, Math.max(1, Math.floor(daysRaw)));
      return await this.runWithCompany(dto.companyId, () =>
        this.dashboard.getDailyCostTrend(dto.companyId, days),
      );
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.agentUsage.aggregateDaily')
  async aggregateDailyAgentUsage(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CompanyRpcDto, payload);
      assertBillingAdmin(dto.actor);
      return await this.runWithCompany(dto.companyId, () => this.agentUsage.aggregateIncremental());
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('billing.agentUsage.aggregateIncremental')
  async aggregateIncrementalAgentUsage(@Payload() payload: unknown) {
    return this.aggregateDailyAgentUsage(payload);
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
