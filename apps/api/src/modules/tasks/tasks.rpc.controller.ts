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
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { TenantContextService } from '@service/tenant';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { AppendExecutionLogDto } from './dto/append-execution-log.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { QueryTasksDto } from './dto/query-tasks.dto.js';
import { RequestBreakdownDto } from './dto/request-breakdown.dto.js';
import { UpdateProgressDto } from './dto/update-progress.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { DashboardService } from './services/dashboard.service.js';
import { TaskExecutionService } from './services/task-execution.service.js';
import { TaskOrchestratorService } from './services/task-orchestrator.service.js';
import { TaskRunService } from './services/task-run.service.js';
import { TasksService } from './services/tasks.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class TasksFindAllRpcDto extends QueryTasksDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class TasksIdRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  id: string;
}

class TasksTreeRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  id: string;
}

class TasksCreateRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => CreateTaskDto)
  data: CreateTaskDto;

  /** 默认 manual；Worker 自治路径传 autonomous */
  @IsOptional()
  @IsIn(['manual', 'autonomous'])
  source?: 'manual' | 'autonomous';
}

class TasksUpdateRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateTaskDto)
  data: UpdateTaskDto;
}

class TasksAssignRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => AssignTaskDto)
  data: AssignTaskDto;
}

class TasksProgressRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateProgressDto)
  data: UpdateProgressDto;
}

class TasksBreakdownRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => RequestBreakdownDto)
  data: RequestBreakdownDto;
}

class TasksRemoveRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  id: string;
}

class TasksExecutionLogRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => AppendExecutionLogDto)
  data: AppendExecutionLogDto;
}

class TasksExecutionLogForRunAppendRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  runId: string;

  @ValidateNested()
  @Type(() => AppendExecutionLogDto)
  data: AppendExecutionLogDto;
}

class TasksExecutionLogsByRunRpcDto {
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
  @Max(500)
  limit?: number;
}

class TasksExecutionLogsListRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  id: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsUUID()
  runId?: string;
}

class DashboardRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

const taskRunTriggers = ['temporal', 'schedule', 'manual', 'nest_timer'] as const;

class TaskRunStartRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsIn(taskRunTriggers)
  triggerSource: (typeof taskRunTriggers)[number];

  @IsOptional()
  @IsString()
  temporalWorkflowId?: string;

  @IsOptional()
  @IsString()
  temporalRunId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  approvalRequestId?: string;
}

class TaskRunIdRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  runId: string;

  @IsOptional()
  @IsString()
  costEstimate?: string;

  @IsOptional()
  @IsString()
  actualCost?: string;
}

class TaskRunFailRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  runId: string;

  @IsString()
  errorSummary: string;
}

class TaskRunsListRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

class TasksExecutionLogsGroupedRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  id: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

@Controller()
export class TasksRpcController {
  private readonly logger = new Logger(TasksRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tasksService: TasksService,
    private readonly orchestrator: TaskOrchestratorService,
    private readonly execution: TaskExecutionService,
    private readonly dashboard: DashboardService,
    private readonly taskRuns: TaskRunService,
  ) {}

  @MessagePattern('tasks.findAll')
  async findAll(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksFindAllRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'tasks.findAll',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.runWithCompany(dto.companyId, () =>
            this.tasksService.findAll(dto, dto.actor),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.findOne')
  async findOne(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksIdRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.findOne(dto.id, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.tree')
  async tree(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksTreeRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.getTree(dto.id, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.create')
  async create(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksCreateRpcDto, payload);
      const source = dto.source === 'autonomous' ? 'autonomous' : 'manual';
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.create(dto.data, dto.actor, { source }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.update')
  async update(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksUpdateRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.update(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.assign')
  async assign(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksAssignRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.assign(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.updateProgress')
  async updateProgress(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksProgressRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.updateProgress(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.remove')
  async remove(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksRemoveRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.remove(dto.id, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.requestBreakdown')
  async requestBreakdown(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksBreakdownRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.orchestrator.requestBreakdown(dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.executionLog.append')
  async appendExecutionLog(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksExecutionLogRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.execution.appendLog(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.executionLog.appendForRun')
  async appendExecutionLogForRun(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksExecutionLogForRunAppendRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.execution.appendLogForRun(dto.runId, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.executionLogs.listByRunId')
  async listExecutionLogsByRunId(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksExecutionLogsByRunRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.execution.listExecutionLogsByRunId(dto.runId, dto.actor, dto.limit),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.executionLogs.list')
  async listExecutionLogs(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksExecutionLogsListRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.execution.listExecutionLogs(dto.id, dto.actor, dto.limit, dto.runId),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.executionLogs.groupedByRun')
  async executionLogsGroupedByRun(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksExecutionLogsGroupedRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.execution.listExecutionLogsGroupedByRun(dto.id, dto.actor, dto.limit),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.dependencies.list')
  async listTaskDependencies(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(DashboardRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.listDependencyEdges(dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.run.start')
  async taskRunStart(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TaskRunStartRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.taskRuns.startRun(
          {
            triggerSource: dto.triggerSource,
            temporalWorkflowId: dto.temporalWorkflowId ?? null,
            temporalRunId: dto.temporalRunId ?? null,
            metadata: dto.metadata ?? null,
            approvalRequestId: dto.approvalRequestId ?? null,
          },
          dto.actor,
        ),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.run.complete')
  async taskRunComplete(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TaskRunIdRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.taskRuns.completeRun(dto.runId, dto.actor, {
          ...(dto.costEstimate !== undefined ? { costEstimate: dto.costEstimate ?? null } : {}),
          ...(dto.actualCost !== undefined ? { actualCost: dto.actualCost ?? null } : {}),
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.run.fail')
  async taskRunFail(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TaskRunFailRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.taskRuns.failRun(dto.runId, dto.actor, dto.errorSummary),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.runs.list')
  async taskRunsList(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TaskRunsListRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.taskRuns.listRuns(dto.actor, {
          limit: dto.limit,
          page: dto.page,
          taskId: dto.taskId,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('dashboard.boardRunSummary')
  async boardRunSummary(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(DashboardRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'dashboard.boardRunSummary',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.runWithCompany(dto.companyId, () =>
            this.taskRuns.getBoardRunSummary(dto.actor),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('dashboard.companySummary')
  async companySummary(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(DashboardRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'dashboard.companySummary',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.runWithCompany(dto.companyId, () =>
            this.dashboard.getCompanySummary(dto.actor),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private runWithCompany<T>(companyId: string, fn: () => Promise<T>) {
    return this.tenantContext.runWithCompanyId(companyId, fn);
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
