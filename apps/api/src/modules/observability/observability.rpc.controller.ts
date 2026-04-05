import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { TaskRun } from '../tasks/entities/task-run.entity.js';
import { ClickhouseTraceService } from './clickhouse-trace.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  roles?: string[];
}

class ObsTraceByRunRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  runId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;
}

@Controller()
export class ObservabilityRpcController {
  private readonly logger = new Logger(ObservabilityRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly clickhouse: ClickhouseTraceService,
    @InjectRepository(TaskRun) private readonly runsRepo: Repository<TaskRun>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
  ) {}

  private runWithCompany<T>(companyId: string, fn: () => Promise<T>) {
    return this.tenantContext.runWithCompanyId(companyId, fn);
  }

  private async assertRunReadable(companyId: string, runId: string, actor: ActorDto): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: '需要登录' });
    }
    if (!actor.roles?.includes('admin')) {
      const membership = await this.membershipsRepo.findOne({
        where: { companyId, userId: actor.id, isActive: true },
      });
      if (!membership) {
        throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: '无权访问该公司' });
      }
    }
    const run = await this.runsRepo.findOne({ where: { id: runId, companyId } });
    if (!run) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '运行记录不存在' });
    }
  }

  private toRpcError(e: unknown): RpcException {
    const err = e as { status?: number; response?: { code?: string; message?: string } };
    const status = err?.status ?? 500;
    const code = err?.response?.code ?? 'INTERNAL_ERROR';
    const message = err?.response?.message ?? (e instanceof Error ? e.message : String(e));
    return new RpcException({ status, message: { code, message } });
  }

  @MessagePattern('observability.trace.listByRunId')
  async listTraceByRunId(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ObsTraceByRunRpcDto, payload);
      return await this.runWithCompany(dto.companyId, async () => {
        await this.assertRunReadable(dto.companyId, dto.runId, dto.actor);
        return this.clickhouse.listByRunId(dto.companyId, dto.runId, dto.limit);
      });
    } catch (e: unknown) {
      this.logger.warn('observability.trace.listByRunId failed', e instanceof Error ? e.message : e);
      throw this.toRpcError(e);
    }
  }
}
