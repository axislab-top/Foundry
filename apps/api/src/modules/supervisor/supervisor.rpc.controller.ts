import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import {
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
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { TenantContextService } from '@service/tenant';
import { SupervisorTemporalBridgeService } from './services/supervisor-temporal-bridge.service.js';
import { SupervisorReviewService } from './services/supervisor-review.service.js';
import { SupervisorMetricsService } from './services/supervisor-metrics.service.js';
import { SupervisorLessonQueryService } from './services/supervisor-lesson-query.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class SupervisorEnqueueRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor!: ActorDto;

  @IsUUID()
  companyId!: string;

  @IsUUID()
  runId!: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsString()
  errorSummary?: string;
}

class SupervisorManualRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor!: ActorDto;

  @IsUUID()
  companyId!: string;

  @IsUUID()
  runId!: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;
}

class SupervisorMetricsRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor!: ActorDto;

  @IsUUID()
  companyId!: string;
}

class SupervisorLessonsRecentRpcDto extends SupervisorMetricsRpcDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@Controller()
export class SupervisorRpcController {
  private readonly logger = new Logger(SupervisorRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly bridge: SupervisorTemporalBridgeService,
    private readonly review: SupervisorReviewService,
    private readonly metrics: SupervisorMetricsService,
    private readonly lessonQuery: SupervisorLessonQueryService,
  ) {}

  /** Worker：失败事件后尝试启动 Temporal；若无 Temporal 则同步执行流水线 */
  @MessagePattern('supervisor.review.enqueue')
  async enqueue(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(SupervisorEnqueueRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'supervisor.review.enqueue',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, async () => {
            const wf = await this.bridge.startSupervisorReviewWorkflow({
              companyId: dto.companyId,
              runId: dto.runId,
              taskId: dto.taskId,
            });
            if (wf) {
              return { mode: 'temporal' as const, workflowId: wf };
            }
            this.logger.warn('Temporal unavailable; running supervisor pipeline inline');
            const result = await this.review.executeReviewPipeline({
              companyId: dto.companyId,
              runId: dto.runId,
              taskId: dto.taskId ?? null,
            });
            return { mode: 'inline' as const, ...result };
          }),
      });
    } catch (e: unknown) {
      throw e instanceof RpcException ? e : new RpcException((e as Error)?.message ?? String(e));
    }
  }

  @MessagePattern('supervisor.review.runManual')
  async runManual(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(SupervisorManualRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'supervisor.review.runManual',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.review.executeReviewPipeline({
              companyId: dto.companyId,
              runId: dto.runId,
              taskId: dto.taskId ?? null,
            }),
          ),
      });
    } catch (e: unknown) {
      throw e instanceof RpcException ? e : new RpcException((e as Error)?.message ?? String(e));
    }
  }

  @MessagePattern('supervisor.lessons.recent')
  async lessonsRecent(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(SupervisorLessonsRecentRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'supervisor.lessons.recent',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.lessonQuery.listRecent(dto.companyId, dto.limit ?? 20),
          ),
      });
    } catch (e: unknown) {
      throw e instanceof RpcException ? e : new RpcException((e as Error)?.message ?? String(e));
    }
  }

  @MessagePattern('supervisor.metrics.retrospective')
  async retrospective(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(SupervisorMetricsRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'supervisor.metrics.retrospective',
        payload,
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.metrics.getRetrospectiveSlice(dto.companyId),
          ),
      });
    } catch (e: unknown) {
      throw e instanceof RpcException ? e : new RpcException((e as Error)?.message ?? String(e));
    }
  }
}
