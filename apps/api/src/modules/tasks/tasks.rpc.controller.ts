import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
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
import { DirectorManagementFacadeService } from './services/director-management-facade.service.js';
import { TaskApprovalAtomicBindingService } from './services/task-approval-atomic-binding.service.js';
import { TasksService } from './services/tasks.service.js';
import { DepartmentTaskPipelineService } from './services/department-task-pipeline.service.js';
import { ConfigService } from '../../common/config/config.service.js';
import {
  RequireApproval,
  RiskLevel,
  ApprovalRequestSchema,
  type ApprovalRequest,
} from '@foundry/multi-agent-core';

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

class PipelineStepRpcDto {
  @IsString()
  @MaxLength(512)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  expectedOutput?: string;

  @IsIn(['agent', 'organization_node'])
  assigneeType: 'agent' | 'organization_node';

  @IsUUID()
  assigneeId: string;
}

class DepartmentPipelineProgramRpcDto {
  @IsUUID()
  rootProgramTaskId: string;

  @IsInt()
  @Min(0)
  sequenceIndex: number;
}

class DepartmentPipelineSequentialDataRpcDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PipelineStepRpcDto)
  steps: PipelineStepRpcDto[];

  @IsUUID()
  departmentOrganizationNodeId: string;

  @IsOptional()
  requireCeoSupervision?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => DepartmentPipelineProgramRpcDto)
  program?: DepartmentPipelineProgramRpcDto;
}

class TasksDepartmentPipelineSequentialRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => DepartmentPipelineSequentialDataRpcDto)
  data: DepartmentPipelineSequentialDataRpcDto;
}

class DepartmentPipelineHandoffDataRpcDto {
  @IsUUID()
  predecessorTaskId: string;

  @IsUUID()
  successorTaskId: string;

  @IsUUID()
  targetOrganizationNodeId: string;

  @IsString()
  @MaxLength(512)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @IsOptional()
  @IsUUID()
  requestingDirectorAgentId?: string;
}

class TasksDepartmentPipelineHandoffRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => DepartmentPipelineHandoffDataRpcDto)
  data: DepartmentPipelineHandoffDataRpcDto;
}

class TasksSupervisionResolveDataRpcDto {
  @IsUUID()
  parentTaskId: string;

  @IsIn(['pass', 'fail', 'human_required'])
  decision: 'pass' | 'fail' | 'human_required';

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  failureReason?: string;
}

class TasksSupervisionResolveRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => TasksSupervisionResolveDataRpcDto)
  data: TasksSupervisionResolveDataRpcDto;
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

const taskRunTriggers = [
  'temporal',
  'schedule',
  'manual',
  'nest_timer',
  'task_completed',
  'budget_warning',
] as const;

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

class TaskRunInterveneRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  runId: string;

  @IsIn(['pause', 'force_degrade_model', 'human_takeover'])
  action: 'pause' | 'force_degrade_model' | 'human_takeover';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
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

class TasksDirectorDelegateDataDto {
  @IsUUID()
  directorAgentId: string;

  @IsUUID()
  assigneeAgentId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  @IsOptional()
  @IsString({ each: true })
  successCriteria?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedEffortHours?: number;
}

class TasksDirectorDelegateRpcDto extends TasksIdRpcDto {
  @ValidateNested()
  @Type(() => TasksDirectorDelegateDataDto)
  data: TasksDirectorDelegateDataDto;
}

class TasksDirectorReviewDataDto {
  @IsUUID()
  reviewerAgentId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  qualityScore: number;

  @IsIn(['excellent', 'good', 'needs_revision', 'unacceptable'])
  overallAssessment: 'excellent' | 'good' | 'needs_revision' | 'unacceptable';

  @IsOptional()
  @IsString({ each: true })
  strengths?: string[];

  @IsOptional()
  @IsString({ each: true })
  improvementAreas?: string[];

  @IsOptional()
  @IsString()
  detailedFeedback?: string;

  @Type(() => Boolean)
  approveToProceed: boolean;

  @IsOptional()
  @IsString({ each: true })
  requiredRevisions?: string[] | null;

  @IsOptional()
  @IsString()
  suggestedNextStep?: string;

  @IsOptional()
  @IsIn(['positive', 'neutral', 'negative'])
  performanceImpact?: 'positive' | 'neutral' | 'negative';
}

class TasksDirectorReviewRpcDto extends TasksIdRpcDto {
  @ValidateNested()
  @Type(() => TasksDirectorReviewDataDto)
  data: TasksDirectorReviewDataDto;
}

class TasksDirectorBatchReviewRpcDto extends DashboardRpcDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  taskIds: string[];

  @IsUUID()
  directorAgentId: string;
}

class TasksDirectorProgressReportRpcDto extends DashboardRpcDto {
  @IsUUID()
  directorAgentId: string;

  @IsIn(['daily', 'weekly', 'monthly'])
  period: 'daily' | 'weekly' | 'monthly';
}

class TasksChatDispatchDataDto {
  @IsUUID()
  departmentRoomId: string;

  @IsOptional()
  @IsUUID()
  fromRoomId?: string | null;

  @IsOptional()
  @IsUUID()
  fromMessageId?: string | null;

  @IsOptional()
  @IsUUID()
  reportBackRoomId?: string | null;

  @IsOptional()
  createThread?: boolean;

  @IsOptional()
  @IsString()
  threadTitle?: string | null;
}

class TasksChatDispatchRpcDto extends TasksIdRpcDto {
  @ValidateNested()
  @Type(() => TasksChatDispatchDataDto)
  data: TasksChatDispatchDataDto;
}

class TasksChatReportDataDto {
  @IsOptional()
  @IsUUID()
  mainRoomId?: string | null;

  @IsOptional()
  @IsUUID()
  sourceRoomId?: string | null;

  @IsOptional()
  @IsUUID()
  sourceThreadId?: string | null;

  @IsString()
  summary: string;
}

class TasksChatReportRpcDto extends TasksIdRpcDto {
  @ValidateNested()
  @Type(() => TasksChatReportDataDto)
  data: TasksChatReportDataDto;
}

class TasksChatCoordinationDataDto {
  @IsOptional()
  @IsUUID()
  mainRoomId?: string | null;

  @IsUUID()
  targetDepartmentRoomId: string;

  @IsString()
  request: string;

  @IsOptional()
  @IsString()
  neededBy?: string | null;

  @IsOptional()
  @IsUUID()
  sourceRoomId?: string | null;

  @IsOptional()
  @IsUUID()
  sourceMessageId?: string | null;
}

class TasksChatCoordinationRpcDto extends TasksIdRpcDto {
  @ValidateNested()
  @Type(() => TasksChatCoordinationDataDto)
  data: TasksChatCoordinationDataDto;
}

class TasksDelegationCandidatesRpcDto extends TasksIdRpcDto {
  @IsOptional()
  @IsUUID()
  roomId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}

class TasksCeoDelegateDataDto {
  @IsUUID()
  ceoAgentId: string;

  @IsUUID()
  directorAgentId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  @IsOptional()
  @Type(() => Boolean)
  requiresHumanApproval?: boolean;

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

class TasksCeoDelegateRpcDto extends DashboardRpcDto {
  @ValidateNested()
  @Type(() => TasksCeoDelegateDataDto)
  data: TasksCeoDelegateDataDto;
}

class TasksGoalsListByRoomRpcDto extends DashboardRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsIn(['main', 'sub'])
  goalLevel?: 'main' | 'sub';

  /** ISO 8601：仅返回 `updated_at >= sinceUpdatedAt` 的目标卡片（与编排轮询对齐）。 */
  @IsOptional()
  @IsString()
  sinceUpdatedAt?: string;

  /** 过滤 `metadata.sourceMessageId` 与给定消息 id 一致的主/子目标。 */
  @IsOptional()
  @IsUUID()
  sourceMessageId?: string;
}

class TasksGoalsEnsureMainDataDto {
  @IsUUID()
  roomId: string;

  @IsUUID()
  sourceMessageId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString({ each: true })
  doneConditions?: string[];

  @IsOptional()
  @IsString()
  roundId?: string | null;

  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  @IsString()
  idempotencyKey: string;
}

class TasksGoalsEnsureMainRpcDto extends DashboardRpcDto {
  @ValidateNested()
  @Type(() => TasksGoalsEnsureMainDataDto)
  data: TasksGoalsEnsureMainDataDto;
}

/** 协作主群 Worker：代人类成员建主目标（`attributedUserId` 须为房内活跃成员） */
class TasksGoalsEnsureMainCollaborationDataDto extends TasksGoalsEnsureMainDataDto {
  @IsUUID()
  attributedUserId: string;
}

class TasksGoalsEnsureMainCollaborationRpcDto extends DashboardRpcDto {
  @ValidateNested()
  @Type(() => TasksGoalsEnsureMainCollaborationDataDto)
  data: TasksGoalsEnsureMainCollaborationDataDto;
}

class TasksGoalsAssignDataDto {
  @IsUUID()
  departmentRoomId: string;

  @IsUUID()
  directorAgentId: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString({ each: true })
  doneConditions?: string[];

  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @IsUUID()
  sourceMessageId?: string | null;

  /** Worker 主群编排下发：同一 key 只创建一条子目标（幂等） */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  goalDelegationKey?: string;

  /** Admin/Worker 代发时写入 `created_by_user_id`（须为公司成员） */
  @IsOptional()
  @IsUUID()
  attributedUserId?: string;

  /** 主群 L2 分发计划中的 `tasks[].taskId`（便于审计 / 依赖链排查） */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  distributionPlanTaskId?: string;

  /** 分发计划内依赖的其它 `taskId`（不等同于 DB `task_dependencies` 行，仅作编排语义落库） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  distributionDependsOnTaskIds?: string[];
}

class TasksGoalsAssignRpcDto extends TasksIdRpcDto {
  @ValidateNested()
  @Type(() => TasksGoalsAssignDataDto)
  data: TasksGoalsAssignDataDto;
}

class TasksGoalsCloseRoundDataDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  closeBy?: string;

  @IsOptional()
  @IsIn(['in_progress', 'completed', 'paused', 'blocked', 'cancelled'])
  status?: 'in_progress' | 'completed' | 'paused' | 'blocked' | 'cancelled';
}

class TasksGoalsCloseRoundRpcDto extends TasksIdRpcDto {
  @ValidateNested()
  @Type(() => TasksGoalsCloseRoundDataDto)
  data: TasksGoalsCloseRoundDataDto;
}

class TasksGoalsCompleteMainRoomDistributionChildDataDto {
  @IsUUID()
  parentGoalTaskId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;
}

class TasksGoalsCompleteMainRoomDistributionChildRpcDto extends TasksIdRpcDto {
  @ValidateNested()
  @Type(() => TasksGoalsCompleteMainRoomDistributionChildDataDto)
  data: TasksGoalsCompleteMainRoomDistributionChildDataDto;
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
    private readonly directorManagementFacade: DirectorManagementFacadeService,
    private readonly approvalBinding: TaskApprovalAtomicBindingService,
    private readonly configService: ConfigService,
    private readonly departmentTaskPipeline: DepartmentTaskPipelineService,
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

  @MessagePattern('tasks.delegateByDirector')
  async delegateByDirector(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksDirectorDelegateRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.directorManagementFacade.delegateTask(dto.companyId, dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.reviewByDirector')
  async reviewByDirector(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksDirectorReviewRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.directorManagementFacade.submitReview(dto.companyId, dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.reviewBatchByDirector')
  async reviewBatchByDirector(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksDirectorBatchReviewRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.directorManagementFacade.reviewBatchApprove(
          dto.companyId,
          dto.taskIds,
          dto.directorAgentId,
          dto.actor,
        ),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.director.generateProgressReport')
  async directorGenerateProgressReport(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksDirectorProgressReportRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.directorManagementFacade.generateProgressReport(
          dto.companyId,
          dto.directorAgentId,
          dto.period,
        ),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.ceo.delegateToDirector')
  @RequireApproval({ riskLevel: RiskLevel.HIGH, action: 'tasks.ceo.delegateToDirector' })
  async ceoDelegateToDirector(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksCeoDelegateRpcDto, payload);
      return await this.runWithCompany(dto.companyId, async () => {
        const isHighRisk =
          dto.data.priority === 'high' ||
          dto.data.priority === 'urgent' ||
          Boolean(dto.data.requiresHumanApproval);
        if (!isHighRisk || !this.configService.isApprovalGateEnabled()) {
          return this.directorManagementFacade.delegateFromCeo(dto.companyId, dto.data, dto.actor);
        }
        if (this.configService.isAdvancedApprovalEnabled()) {
          const traceId = dto.data.traceId || randomUUID();
          // Create the task first, then immediately bind it to an advanced approval flow and block it.
          // This ensures the task cannot proceed until the multi-level approval flow reaches approved.
          const created = await this.directorManagementFacade.delegateFromCeo(dto.companyId, { ...dto.data, traceId }, dto.actor);
          const taskId = String((created as any)?.id ?? '').trim();
          if (!taskId) {
            throw new RpcException({ status: 500, message: 'delegate created task missing id' });
          }
          await this.approvalBinding.executeWithAdvancedApproval({
            companyId: dto.companyId,
            actorId: dto.actor.id,
            taskId,
            action: 'tasks.ceo.delegateToDirector',
            riskLevel: RiskLevel.CRITICAL,
            policyVersion: 1,
            traceId,
            businessLogic: async () => created,
            metadata: { directorAgentId: dto.data.directorAgentId, priority: dto.data.priority ?? 'normal' },
          });
          return created;
        }
        const approvalRequest = ApprovalRequestSchema.parse({
          traceId: dto.data.traceId || randomUUID(),
          riskLevel: RiskLevel.HIGH,
          requestedAction: 'tasks.ceo.delegateToDirector',
          policyRef: 'policy:ceo-high-risk-delegate',
          approver: 'human',
          expiresAt: Date.now() + 24 * 3600_000,
          payload: {
            taskId: null,
            requiresHumanApproval: true,
            priority: dto.data.priority ?? 'normal',
            directorAgentId: dto.data.directorAgentId,
          },
        }) as ApprovalRequest;

        return this.approvalBinding.executeWithApproval({
          companyId: dto.companyId,
          actorId: dto.actor.id,
          approvalRequest,
          businessLogic: () =>
            this.directorManagementFacade.delegateFromCeo(dto.companyId, dto.data, dto.actor),
          options: { taskId: undefined },
        });
      });
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

  @MessagePattern('tasks.chat.dispatchToDepartment')
  async chatDispatchToDepartment(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksChatDispatchRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.dispatchTaskToDepartmentRoom(dto.id, dto.data as any, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.chat.reportToMain')
  async chatReportToMain(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksChatReportRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.reportTaskToMainRoom(dto.id, dto.data as any, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.chat.requestCoordination')
  async chatRequestCoordination(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksChatCoordinationRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.requestTaskCoordination(dto.id, dto.data as any, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.delegation.candidates')
  async delegationCandidates(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksDelegationCandidatesRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.listDelegationCandidates(
          dto.id,
          { roomId: dto.roomId ?? null, limit: dto.limit },
          dto.actor,
        ),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.goals.listByRoom')
  async goalsListByRoom(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksGoalsListByRoomRpcDto, payload);
      const since =
        dto.sinceUpdatedAt && !Number.isNaN(Date.parse(dto.sinceUpdatedAt))
          ? new Date(dto.sinceUpdatedAt)
          : undefined;
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.listGoalCardsByRoom(dto.roomId, dto.goalLevel ?? null, dto.actor, {
          sinceUpdatedAt: since,
          sourceMessageId: dto.sourceMessageId,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.goals.ensureMain')
  async goalsEnsureMain(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksGoalsEnsureMainRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.ensureMainGoalFromPipeline(dto.data as any, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.goals.ensureMainCollaboration')
  async goalsEnsureMainCollaboration(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksGoalsEnsureMainCollaborationRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.ensureMainGoalFromCollaborationPipeline(dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.goals.assignToDepartmentDirector')
  async goalsAssignToDepartmentDirector(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksGoalsAssignRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.assignGoalToDepartmentDirector(dto.id, dto.data as any, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.goals.closeRound')
  async goalsCloseRound(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksGoalsCloseRoundRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.closeGoalRound(dto.id, dto.data as any, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /** `id` = 部门子目标子任务 id；用于编排监督侧结案并触发 `task.completed`（依赖派发、主群结案摘要等）。 */
  @MessagePattern('tasks.goals.completeMainRoomDistributionChild')
  async goalsCompleteMainRoomDistributionChild(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksGoalsCompleteMainRoomDistributionChildRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.completeMainRoomDistributionSubGoal(dto.id, dto.data as any, dto.actor),
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

  @MessagePattern('tasks.runs.get')
  async taskRunGet(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TaskRunIdRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () => this.taskRuns.getRun(dto.runId, dto.actor));
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.runs.intervene')
  async taskRunIntervene(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TaskRunInterveneRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.taskRuns.interveneRun(dto.runId, dto.actor, {
          action: dto.action,
          reason: dto.reason,
          params: dto.params ?? null,
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

  @MessagePattern('tasks.departmentPipeline.createSequential')
  async departmentPipelineCreateSequential(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksDepartmentPipelineSequentialRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.departmentTaskPipeline.createSequentialPipeline(dto.companyId, dto.actor, {
          parentTaskId: dto.id,
          departmentOrganizationNodeId: dto.data.departmentOrganizationNodeId,
          requireCeoSupervision: dto.data.requireCeoSupervision ?? true,
          steps: dto.data.steps,
          program: dto.data.program,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.departmentPipeline.crossDepartmentHandoff')
  async departmentPipelineCrossDepartmentHandoff(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksDepartmentPipelineHandoffRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.departmentTaskPipeline.createCrossDepartmentHandoff(dto.companyId, dto.actor, {
          parentTaskId: dto.id,
          predecessorTaskId: dto.data.predecessorTaskId,
          successorTaskId: dto.data.successorTaskId,
          targetOrganizationNodeId: dto.data.targetOrganizationNodeId,
          title: dto.data.title,
          description: dto.data.description,
          requestingDirectorAgentId: dto.data.requestingDirectorAgentId,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('tasks.supervision.resolve')
  async supervisionResolve(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(TasksSupervisionResolveRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.tasksService.resolveDepartmentPipelineSupervision(dto.companyId, dto.actor, dto.data),
      );
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
