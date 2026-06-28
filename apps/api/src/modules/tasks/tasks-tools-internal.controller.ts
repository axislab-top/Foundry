import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TenantContextService } from '@service/tenant';
import { TasksService } from './services/tasks.service.js';
import { AgentPeerSummonInternalService } from '../collaboration/services/agent-peer-summon-internal.service.js';

class InternalCreateAndAssignTaskDto {
  @IsUUID()
  companyId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  assigneeAgentId: string;

  @IsOptional()
  @IsString()
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  expectedOutput?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

class InternalListDepartmentTasksDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  departmentNodeId: string;

  @IsOptional()
  @IsIn(['pending', 'in_progress', 'review', 'awaiting_approval', 'awaiting_supervision', 'completed', 'blocked', 'cancelled', 'paused'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

class InternalDeptSupervisionResolveDto {
  @IsUUID()
  companyId: string;

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

class InternalSendToAgentDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  targetAgentId: string;

  @IsString()
  content: string;

  @IsUUID()
  senderAgentId: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsBoolean()
  expectReply?: boolean;

  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsOptional()
  @IsUUID()
  anchorMessageId?: string;

  /** @deprecated 使用 senderAgentId */
  @IsOptional()
  @IsUUID()
  senderUserId?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

@Controller('internal/tools')
export class TasksToolsInternalController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tasksService: TasksService,
    private readonly agentPeerSummon: AgentPeerSummonInternalService,
  ) {}

  private assertToken(token: string | undefined): void {
    const expected = String(process.env.API_INTERNAL_AUTH_SECRET ?? '').trim();
    if (!expected) throw new UnauthorizedException('internal tool routes disabled');
    if (String(token ?? '').trim() !== expected) throw new UnauthorizedException('invalid internal auth');
  }

  private internalActor() {
    return { id: '00000000-0000-0000-0000-000000000001', roles: ['admin'] as string[] };
  }

  @Post('tasks/create-and-assign')
  @HttpCode(HttpStatus.OK)
  async createAndAssign(
    @Query('token') token: string | undefined,
    @Body() body: InternalCreateAndAssignTaskDto,
  ) {
    this.assertToken(token);
    const actor = this.internalActor();
    return this.tenantContext.runWithCompanyId(body.companyId, async () => {
      const created = await this.tasksService.create(
        {
          title: body.title,
          description: body.description,
          assigneeType: 'agent',
          assigneeId: body.assigneeAgentId,
          priority: (body.priority as any) ?? 'normal',
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          expectedOutput: body.expectedOutput,
          metadata: body.metadata ?? null,
        },
        actor,
      );
      return { ok: true, task: created };
    });
  }

  @Post('tasks/list-by-department')
  @HttpCode(HttpStatus.OK)
  async listByDepartment(
    @Query('token') token: string | undefined,
    @Body() body: InternalListDepartmentTasksDto,
  ) {
    this.assertToken(token);
    const actor = this.internalActor();
    return this.tenantContext.runWithCompanyId(body.companyId, async () => {
      const out = await this.tasksService.findAll(
        {
          page: body.page ?? 1,
          pageSize: body.pageSize ?? 20,
          status: body.status as any,
          departmentOrganizationNodeId: body.departmentNodeId,
        },
        actor,
      );
      return { ok: true, ...out };
    });
  }

  @Post('tasks/department-supervision-resolve')
  @HttpCode(HttpStatus.OK)
  async departmentSupervisionResolve(
    @Query('token') token: string | undefined,
    @Body() body: InternalDeptSupervisionResolveDto,
  ) {
    this.assertToken(token);
    const actor = this.internalActor();
    return this.tenantContext.runWithCompanyId(body.companyId, async () => {
      const task = await this.tasksService.resolveDepartmentPipelineSupervision(body.companyId, actor, {
        parentTaskId: body.parentTaskId,
        decision: body.decision,
        summary: body.summary,
        failureReason: body.failureReason,
      });
      return { ok: true, task };
    });
  }

  @Post('collaboration/send-to-agent')
  @HttpCode(HttpStatus.OK)
  async sendToAgent(
    @Query('token') token: string | undefined,
    @Body() body: InternalSendToAgentDto,
  ) {
    this.assertToken(token);
    return this.tenantContext.runWithCompanyId(body.companyId, async () => {
      return this.agentPeerSummon.send({
        companyId: body.companyId,
        senderAgentId: body.senderAgentId,
        targetAgentId: body.targetAgentId,
        content: body.content,
        roomId: body.roomId,
        expectReply: body.expectReply,
        threadId: body.threadId,
        anchorMessageId: body.anchorMessageId,
        metadata: body.metadata,
      });
    });
  }
}

