import { BadRequestException, Controller, ForbiddenException } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { Type } from 'class-transformer';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import type { BaseEvent } from '@contracts/events';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { TenantContextService } from '@service/tenant';
import { CollaborationAppendAgentMetadataDto } from './dto/append-agent-metadata.dto.js';
import { RoomMemberRefDto } from './dto/add-members.dto.js';
import { CollaborationDynamicsService } from './services/collaboration-dynamics.service.js';
import { CollaborationSummaryService } from './services/collaboration-summary.service.js';
import { MentionAliasesService } from './services/mention-aliases.service.js';
import { ChatMessageService } from './services/chat-message.service.js';
import { ChatRoomService } from './services/chat-room.service.js';
import { CollaborationBootstrapService } from './services/collaboration-bootstrap.service.js';
import { MainRoomDraftPatchService } from './services/main-room-draft-patch.service.js';
import { MainRoomDispatchPlanPatchService } from './services/main-room-dispatch-plan-patch.service.js';
import { CollaborationOrchestrationRunsService } from './services/collaboration-orchestration-runs.service.js';
import { CollaborationProgramsService } from './services/collaboration-programs.service.js';
import { CollaborationProgramTimelineReadService } from './services/collaboration-program-timeline-read.service.js';
import { TaskIntentWorkflowService } from './execution-intake/task-intent-workflow.service.js';
import { CollaborationOrchestrationRun } from './entities/collaboration-orchestration-run.entity.js';
import { CollaborationRealtimePublisher } from './services/collaboration-realtime-publisher.service.js';
import { DiscussionThreadService } from './services/discussion-thread.service.js';
import { RoomMemberService } from './services/room-member.service.js';
import { HeavyTemporalClientService } from './services/heavy-temporal-client.service.js';
import { IsCollaborationThreadIdOptional } from './dto/collab-thread-id.rpc-fields.js';
import type { CollaborationMode } from './entities/chat-room.entity.js';
import type { DiscussionThreadStatus } from './entities/discussion-thread.entity.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { Task } from '../tasks/entities/task.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { Agent } from '../agents/entities/agent.entity.js';
import type {
  AutonomousCeoApprovalApprovedEvent,
  AutonomousCeoApprovalRejectedEvent,
  AutonomousCeoApprovalResolvedEvent,
  AutonomousCeoApprovalDecision,
  CollaborationModeChangedEvent,
  CollaborationResponderThinkingPayload,
} from '@contracts/events';
import { AgentMessageSchema, type AgentMessage } from '@foundry/multi-agent-core';
import {
  MemoryRetrieverService,
  type MemorySearchHit,
} from '../memory/services/memory-retriever.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class CollaborationCompanyRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class CollaborationRoomsListDto extends CollaborationCompanyRpcDto {}

class CollaborationRoomIdDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;
}

class CollaborationOrchestrationWorkerUpsertDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId!: string;

  @IsUUID()
  sourceMessageId!: string;

  @IsOptional()
  @IsUUID()
  workerRunId?: string | null;

  @IsOptional()
  @IsUUID()
  programId?: string | null;

  /**
   * 历史：status=running/succeeded/failed/skipped（E2E/前端早期兼容）。
   * SSOT：自 2026-06 起 Worker 可能写入 orchestration lifecycle（planning/dispatching/...）。
   * 这里允许两套值并存，落库仍是 varchar(32)。
   */
  @IsIn([
    'pending',
    'running',
    'succeeded',
    'failed',
    'skipped',
    'awaiting_confirm',
    'planning',
    'dispatching',
    'dept_executing',
    'supervising',
    'completed',
    'paused',
  ])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  stage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  errorCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  errorMessage?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

class CollaborationResponderThinkingPublishDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId!: string;

  @IsUUID()
  sourceMessageId!: string;

  @IsIn(['routing', 'thinking', 'idle'])
  status!: CollaborationResponderThinkingPayload['status'];

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(24)
  responderAgentIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  routePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  intentType?: string;

  @IsOptional()
  @IsIn(['L1', 'L2', 'L3'])
  ceoLayer?: CollaborationResponderThinkingPayload['ceoLayer'];

  @IsOptional()
  @IsIn(['main', 'department'])
  roomType?: CollaborationResponderThinkingPayload['roomType'];

  @IsOptional()
  @IsUUID()
  runId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  traceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  startedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  endedAt?: string;
}

class CollaborationOrchestrationRunsListDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class CollaborationProgramsRoomDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  threadId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

class CollaborationProgramWorkerUpsertDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  threadId?: string | null;

  @IsUUID()
  sourceMessageId!: string;

  @IsOptional()
  @IsUUID()
  programId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phase?: string;

  @IsOptional()
  @IsObject()
  brief?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  goalUnderstanding?: Record<string, unknown> | null;

  @IsOptional()
  @IsUUID()
  parentGoalTaskId?: string | null;

  @IsOptional()
  @IsObject()
  dispatch?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  alignment?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @IsOptional()
  @IsIn(['create_intake', 'transition', 'get_active'])
  action?: 'create_intake' | 'transition' | 'get_active';
}

class CollaborationProgramConfirmDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  programId!: string;
}

class CollaborationProgramTimelineDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  programId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

class CollaborationDepartmentSlugDto extends CollaborationCompanyRpcDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  departmentSlug: string;
}

class CollaborationRoomResolveSessionDto extends CollaborationCompanyRpcDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  sessionId: string;

  @IsOptional()
  bindMainFallback?: boolean;
}

class CollaborationMessagesSendDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(65535)
  content: string;

  @IsOptional()
  @IsIn(['text', 'system', 'tool_call', 'stream_chunk'])
  messageType?: 'text' | 'system' | 'tool_call' | 'stream_chunk';

  @IsOptional()
  metadata?: Record<string, unknown>;
}

class MemoryReferenceItemDto {
  @IsUUID()
  memoryEntryId!: string;

  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  namespace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  sourceType?: string;
}

class CollaborationMessagesAppendAgentDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsUUID()
  agentId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(65535)
  content: string;

  @IsOptional()
  @IsIn(['text', 'system', 'tool_call', 'stream_chunk'])
  messageType?: 'text' | 'system' | 'tool_call' | 'stream_chunk';

  @IsOptional()
  @ValidateNested()
  @Type(() => CollaborationAppendAgentMetadataDto)
  metadata?: CollaborationAppendAgentMetadataDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(48)
  @ValidateNested({ each: true })
  @Type(() => MemoryReferenceItemDto)
  memoryReferences?: MemoryReferenceItemDto[];
}

class CollaborationMessagesListDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  beforeSeq?: number;

  /** UUID 或 `main`（仅主频道消息） */
  @IsOptional()
  @IsString()
  threadId?: string;
}

class CollaborationMessagesGetDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  messageId: string;
}

class CollaborationMembersAddDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RoomMemberRefDto)
  members: RoomMemberRefDto[];
}

class CollaborationMembersFromOrganizationNodeDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsUUID()
  organizationNodeId: string;

  @IsOptional()
  @IsIn(['subtree', 'node_only'])
  scope?: 'subtree' | 'node_only';
}

class CollaborationCreateDepartmentRoomDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  organizationNodeId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  departmentSlug?: string;
}

class CollaborationFindOrCreateDirectRoomDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  agentId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  agentName: string;
}

class CollaborationOrgNodesSearchDto extends CollaborationCompanyRpcDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

class CollaborationMessagesSearchRpcDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  q?: string;

  @IsOptional()
  @IsIn(['human', 'agent'])
  senderType?: 'human' | 'agent';

  @IsOptional()
  @IsUUID()
  senderId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

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

class CollaborationMembersRemoveRpcDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsIn(['human', 'agent'])
  memberType: 'human' | 'agent';

  @IsUUID()
  memberId: string;
}

class CollaborationRoomSummaryRequestRpcDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsIn(['manual', 'scheduled'])
  mode?: 'manual' | 'scheduled';
}

class L1DecisionHistoryRpcDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class CollaborationCeoApprovalResolveRpcDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  approvalId: string;

  @IsIn(['approved', 'rejected', 'modified'])
  decision: AutonomousCeoApprovalDecision;

  @IsOptional()
  @IsString()
  note?: string;
}

class CollaborationDirectorProgressReportRpcDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsUUID()
  directorAgentId: string;

  @IsIn(['weekly', 'heartbeat', 'ad-hoc'])
  reportType: 'weekly' | 'heartbeat' | 'ad-hoc';

  @IsObject()
  report: Record<string, unknown>;
}

class CollaborationHeavyWorkflowsListRpcDto extends CollaborationCompanyRpcDto {
  @IsOptional()
  @IsUUID()
  companyIdOverride?: string;
}

class CollaborationHeavyWorkflowGetRpcDto extends CollaborationCompanyRpcDto {
  @IsString()
  @MinLength(1)
  workflowId: string;
}

class CollaborationHeavyWorkflowSignalRpcDto extends CollaborationCompanyRpcDto {
  @IsString()
  @MinLength(1)
  workflowId: string;

  @IsIn(['humanApprovalSignal', 'interventionSignal'])
  signalType: 'humanApprovalSignal' | 'interventionSignal';

  @IsOptional()
  @IsString()
  approvalRequestId?: string;

  @IsOptional()
  @IsIn(['approve', 'reject', 'revise'])
  decision?: 'approve' | 'reject' | 'revise';

  @IsOptional()
  @IsString()
  reason?: string;
}

type TaskApprovalLookupRow = {
  id: string;
  metadata?: Record<string, unknown> | null;
};

const COLLABORATION_MODE_VALUES: CollaborationMode[] = [
  'discussion',
  'direct',
  'execution',
  'approval_wait',
];

class CollaborationRoomUpdateModeDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsIn(COLLABORATION_MODE_VALUES)
  collaborationMode: CollaborationMode;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  changeReason?: string;
}

class CollaborationRoomMergeMetadataDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  metadata!: Record<string, unknown>;
}

class CollaborationThreadsListDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;
}

class CollaborationThreadCreateDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  title?: string;

  @IsOptional()
  @IsIn(COLLABORATION_MODE_VALUES)
  collaborationMode?: CollaborationMode;
}

class CollaborationThreadUpdateDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  threadId: string;

  @IsOptional()
  @IsIn(['open', 'converged', 'archived'])
  status?: DiscussionThreadStatus;

  @IsOptional()
  @IsIn(COLLABORATION_MODE_VALUES)
  collaborationMode?: CollaborationMode | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  summary?: string;
}

class CollaborationThreadIncrementRoundDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  threadId: string;
}

class CollaborationThreadMergeMetadataDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  threadId: string;

  @IsObject()
  metadata!: Record<string, unknown>;
}

class CollaborationMessagesPatchMetadataDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  messageId: string;

  metadata!: Record<string, unknown>;
}

class TaskIntentSpecPatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  expectedOutput?: string;

  @IsOptional()
  @IsIn(['unassigned', 'agent', 'organization_node'])
  assigneeType?: 'unassigned' | 'agent' | 'organization_node';

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptanceCriteria?: string[];
}

class CollaborationTaskIntentCandidatePatchDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  candidateId!: string;

  @ValidateNested()
  @Type(() => TaskIntentSpecPatchDto)
  patch!: TaskIntentSpecPatchDto;
}

class CollaborationTaskIntentCandidateConfirmDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  candidateId!: string;
}

class MentionAliasItemDto {
  @IsString()
  @MaxLength(120)
  label!: string;

  @IsIn(['department', 'role', 'title'])
  nodeType!: 'department' | 'role' | 'title';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetNodeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetAgentIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  confidenceBoost?: number;
}

class CollaborationMentionAliasesListDto extends CollaborationCompanyRpcDto {}

class CollaborationMentionAliasesUpsertDto extends CollaborationCompanyRpcDto {
  @ValidateNested()
  @Type(() => MentionAliasItemDto)
  alias!: MentionAliasItemDto;
}

class CollaborationMentionAliasesRemoveDto extends CollaborationCompanyRpcDto {
  @IsString()
  @MaxLength(120)
  label!: string;
}

class MainRoomDraftStrategicPhaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phaseId?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(4000)
  outcome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deadline?: string;
}

class CollaborationMainRoomDraftGetDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId!: string;

  /** 讨论串 id；Worker 侧 sentinel `main` 表示主会话 */
  @IsCollaborationThreadIdOptional()
  threadId?: string;
}

class CollaborationMainRoomDraftPatchStrategyDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId!: string;

  @IsCollaborationThreadIdOptional()
  threadId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  strategyGoal!: string;

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => MainRoomDraftStrategicPhaseDto)
  strategicPhases!: MainRoomDraftStrategicPhaseDto[];
}

class MainRoomDistributionRowDto {
  @IsString()
  @MaxLength(128)
  department!: string;

  @IsString()
  @MaxLength(32)
  priority!: string;

  @IsString()
  @MaxLength(2000)
  deliverable!: string;
}

class CollaborationMainRoomDraftPatchDistributionDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId!: string;

  @IsCollaborationThreadIdOptional()
  threadId?: string;

  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => MainRoomDistributionRowDto)
  rows!: MainRoomDistributionRowDto[];
}

class DispatchPlanAssignmentDto {
  @IsString()
  @MaxLength(80)
  departmentSlug!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(4000)
  objective!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  acceptanceCriteria?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  dependsOnSlugs?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(8)
  priority?: string;
}

class CollaborationDispatchPlanDraftGetDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId!: string;

  @IsCollaborationThreadIdOptional()
  threadId?: string;
}

class CollaborationDispatchPlanDraftPatchDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId!: string;

  @IsCollaborationThreadIdOptional()
  threadId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  goal!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32000)
  bodyMarkdown?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  executionOrder?: string;

  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => DispatchPlanAssignmentDto)
  assignments!: DispatchPlanAssignmentDto[];
}

@Controller()
export class CollaborationRpcController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly rooms: ChatRoomService,
    private readonly threads: DiscussionThreadService,
    private readonly messages: ChatMessageService,
    private readonly members: RoomMemberService,
    private readonly dynamics: CollaborationDynamicsService,
    private readonly collaborationBootstrap: CollaborationBootstrapService,
    private readonly summary: CollaborationSummaryService,
    private readonly mentionAliases: MentionAliasesService,
    private readonly memoryRetriever: MemoryRetrieverService,
    private readonly heavyTemporalClient: HeavyTemporalClientService,
    private readonly taskIntentWorkflow: TaskIntentWorkflowService,
    private readonly messaging: MessagingService,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    private readonly mainRoomDraftPatch: MainRoomDraftPatchService,
    private readonly mainRoomDispatchPlanPatch: MainRoomDispatchPlanPatchService,
    private readonly collabRealtime: CollaborationRealtimePublisher,
    private readonly orchestrationRuns: CollaborationOrchestrationRunsService,
    private readonly collaborationPrograms: CollaborationProgramsService,
    private readonly programTimelineRead: CollaborationProgramTimelineReadService,
  ) {}

  private getEmploymentBinding(agent: Agent | null): {
    employmentType: 'permanent' | 'temporary';
    projectId: string | null;
  } {
    const meta = (agent as any)?.metadata as Record<string, unknown> | null | undefined;
    const employmentTypeRaw = meta && typeof meta['employmentType'] === 'string' ? String(meta['employmentType']) : '';
    const projectIdRaw = meta && typeof meta['projectId'] === 'string' ? String(meta['projectId']) : '';
    const employmentType = employmentTypeRaw === 'temporary' ? 'temporary' : 'permanent';
    const projectId = projectIdRaw && /^[0-9a-fA-F-]{36}$/.test(projectIdRaw) ? projectIdRaw : null;
    return { employmentType, projectId };
  }

  private async assertTemporaryAgentRoomScope(params: {
    companyId: string;
    roomId: string;
    agentId: string;
  }): Promise<void> {
    const agent = await this.agentsRepo.findOne({
      where: { id: params.agentId, companyId: params.companyId } as any,
    });
    if (!agent) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'agentId 不存在',
      });
    }
    const binding = this.getEmploymentBinding(agent);
    if (binding.employmentType !== 'temporary') return;
    if (!binding.projectId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Temporary Agent 缺少 projectId 绑定',
      });
    }
    const room = await this.rooms.findOneOrFail(params.companyId, params.roomId);
    const roomProjectId = room.taskId ?? null;
    if (!roomProjectId || roomProjectId !== binding.projectId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Temporary Agent 项目范围不匹配',
      });
    }
  }

  private readApprovalRoomIdFromTaskMetadata(task: TaskApprovalLookupRow | null): string | null {
    const meta = (task?.metadata ?? null) as Record<string, unknown> | null;
    if (!meta) return null;
    const roomId = typeof meta.roomId === 'string' ? meta.roomId.trim() : '';
    return roomId || null;
  }

  private async findAnyRoomByCeoApprovalId(companyId: string, approvalId: string): Promise<string | null> {
    const task = await this.tasksRepo
      .createQueryBuilder('t')
      .select(['t.id', 't.metadata'])
      .where('t.companyId = :companyId', { companyId })
      .andWhere("t.metadata->>'ceoApprovalId' = :approvalId", { approvalId })
      .orderBy('t.updatedAt', 'DESC')
      .limit(1)
      .getOne();
    return this.readApprovalRoomIdFromTaskMetadata(task as TaskApprovalLookupRow | null);
  }

  private async findCeoAgentId(companyId: string): Promise<string | null> {
    const ceo = await this.agentsRepo.findOne({
      where: { companyId, role: 'ceo', status: 'active' } as any,
      select: ['id'],
    });
    return ceo?.id ?? null;
  }

  /**
   * Phase 1 bridge: Gateway emits ACP messages via RMQ client proxy; API republishes into the
   * MessagingService bus so Worker can consume via subscribeWithBackoff.
   *
   * Zero-break: guarded by ENABLE_ACP_PROTOCOL feature flag (handled at Gateway/Worker).
   */
  @MessagePattern('collaboration.agent-message.received')
  async agentMessageReceived(@Payload() payload: unknown) {
    const parsed = AgentMessageSchema.safeParse(payload);
    if (!parsed.success) {
      // Keep noisy payloads from poisoning MQ; log and acknowledge.
      throw new RpcException({
        status: 400,
        message: 'Invalid ACP agent message',
        errors: parsed.error.issues,
      });
    }
    const message: AgentMessage = parsed.data;
    const now = new Date().toISOString();
    const event: BaseEvent & { data: Record<string, unknown> } = {
      eventId: randomUUID(),
      eventType: 'collaboration.agent-message.received',
      aggregateId: String((message as any)?.messageId ?? randomUUID()),
      aggregateType: 'agent_message',
      occurredAt: now,
      version: 1,
      companyId: (message as any)?.context?.companyId ?? this.tenantContext.getCompanyId() ?? undefined,
      data: message as unknown as Record<string, unknown>,
    };
    await this.messaging.publish(event, {
      routingKey: 'collaboration.agent-message.received',
      persistent: true,
    });
    return { ok: true };
  }

  @MessagePattern('collaboration.rooms.list')
  async roomsList(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomsListDto, payload);
      return await this.runWithCompany(dto, async () => {
        // 与 findMain 一致：列表前先确保主群存在，避免仅有部门群时前端误把 rooms[0] 当主群。
        await this.collaborationBootstrap.ensureMainRoomForCompany(
          dto.companyId,
          dto.actor.id,
        );
        await this.collaborationBootstrap.ensureDepartmentRoomsForCompany(
          dto.companyId,
          dto.actor.id,
        );
        await this.collaborationBootstrap.ensureDirectRoomsForCompany(dto.companyId);
        return this.rooms.listRoomsWithUnread(dto.companyId, dto.actor.id);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.markRead')
  async roomsMarkRead(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomIdDto, payload);
      return await this.runWithCompany(dto, async () => {
        const room = await this.rooms.findOneOrFail(dto.companyId, dto.roomId);
        await this.members.markHumanRoomRead(
          dto.companyId,
          dto.roomId,
          dto.actor.id,
          room.messageSeq,
        );
        return { ok: true, lastReadSeq: room.messageSeq };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.findMain')
  async roomsFindMain(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomsListDto, payload);
      return await this.runWithCompany(dto, async () => {
        const found = await this.rooms.findMainRoom(dto.companyId);
        if (found) {
          return found;
        }
        // On-demand bootstrap: tolerate missing async `company.created` listener / MQ in dev.
        await this.collaborationBootstrap.ensureMainRoomForCompany(dto.companyId, dto.actor.id);
        return this.rooms.findMainRoom(dto.companyId);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.findOne')
  async roomsFindOne(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomIdDto, payload);
      return await this.runWithCompany(dto, () =>
        this.rooms.findOneOrFail(dto.companyId, dto.roomId),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /** Worker：按 departmentSlug 解析部门群（metadata.departmentSlug），不存在则返回 null */
  @MessagePattern('collaboration.rooms.findDepartmentBySlug')
  async roomsFindDepartmentBySlug(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationDepartmentSlugDto, payload);
      return await this.runWithCompany(dto, async () => {
        const row = await this.rooms.findDepartmentRoomBySlug(dto.companyId, dto.departmentSlug);
        if (!row) return null;
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        const slug = typeof meta.departmentSlug === 'string' ? meta.departmentSlug : dto.departmentSlug;
        return {
          id: row.id,
          roomType: row.roomType,
          name: row.name,
          organizationNodeId: row.organizationNodeId ?? null,
          departmentSlug: slug,
        };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.resolveSession')
  async roomsResolveSession(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomResolveSessionDto, payload);
      return await this.runWithCompany(dto, async () => {
        return this.rooms.resolveRoomIdBySession(dto.companyId, dto.sessionId, {
          bindMainFallback: dto.bindMainFallback !== false,
        });
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.updateCollaborationMode')
  async roomsUpdateCollaborationMode(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomUpdateModeDto, payload);
      return await this.runWithCompany(dto, async () => {
        const admin = dto.actor?.roles?.includes('admin');
        const member =
          admin ||
          (await this.members.isActiveMember(
            dto.companyId,
            dto.roomId,
            'human',
            dto.actor.id,
          ));
        if (!member) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '无权更新该房间协作模式',
          });
        }
        const prev = await this.rooms.findOneOrFail(dto.companyId, dto.roomId);
        const prevMode = prev.collaborationMode;
        const updated = await this.rooms.updateCollaborationMode(
          dto.companyId,
          dto.roomId,
          dto.collaborationMode,
        );
        const changed: CollaborationModeChangedEvent = {
          eventId: randomUUID(),
          eventType: 'collaboration.mode.changed',
          aggregateId: dto.roomId,
          aggregateType: 'chat_room',
          occurredAt: new Date().toISOString(),
          version: 1,
          companyId: dto.companyId,
          data: {
            roomId: dto.roomId,
            previousMode: prevMode ?? null,
            newMode: dto.collaborationMode,
            reason: dto.changeReason ?? 'user_manual',
            changedAt: new Date().toISOString(),
          },
        };
        await this.messaging.publish(changed, {
          routingKey: changed.eventType,
          persistent: true,
        });
        void this.collabRealtime
          .publishCollaborationModeUpdated({
            companyId: dto.companyId,
            roomId: dto.roomId,
            collaborationMode: dto.collaborationMode,
            previousMode: prevMode ?? null,
            changedAt: changed.data.changedAt,
          })
          .catch(() => undefined);
        return updated;
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.orchestrationRuns.workerUpsert')
  async orchestrationRunsWorkerUpsert(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationOrchestrationWorkerUpsertDto, payload);
      if (!dto.actor?.roles?.includes('admin')) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: '需要 Worker 管理员上下文',
        });
      }
      return await this.runWithCompany(dto, async () => {
        const row = await this.orchestrationRuns.workerUpsert({
          companyId: dto.companyId,
          roomId: dto.roomId,
          sourceMessageId: dto.sourceMessageId,
          workerRunId: dto.workerRunId ?? null,
          programId: dto.programId ?? null,
          status: dto.status as 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped',
          stage: dto.stage ?? null,
          errorCode: dto.errorCode ?? null,
          errorMessage: dto.errorMessage ?? null,
          metadata: dto.metadata ?? null,
        });
        return this.serializeOrchestrationRun(row);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.realtime.publishResponderThinking')
  async publishResponderThinking(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationResponderThinkingPublishDto, payload);
      if (!dto.actor?.roles?.includes('admin')) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: '需要 Worker 管理员上下文',
        });
      }
      const thinkingPayload: CollaborationResponderThinkingPayload = {
        sourceMessageId: dto.sourceMessageId,
        status: dto.status,
        responderAgentIds: dto.responderAgentIds,
        routePath: dto.routePath,
        intentType: dto.intentType,
        ceoLayer: dto.ceoLayer,
        roomType: dto.roomType,
        runId: dto.runId,
        traceId: dto.traceId,
        startedAt: dto.startedAt ?? new Date().toISOString(),
        endedAt: dto.endedAt,
      };
      await this.collabRealtime.publishEnvelope({
        event: 'responder:thinking',
        companyId: dto.companyId,
        roomId: dto.roomId,
        payload: thinkingPayload,
      });
      return { ok: true };
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.orchestrationRuns.listByRoom')
  async orchestrationRunsListByRoom(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationOrchestrationRunsListDto, payload);
      return await this.runWithCompany(dto, async () => {
        const admin = dto.actor?.roles?.includes('admin');
        const member =
          admin ||
          (await this.members.isActiveMember(dto.companyId, dto.roomId, 'human', dto.actor.id));
        if (!member) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '无权查看编排运行记录',
          });
        }
        const rows = await this.orchestrationRuns.listByRoom(dto.companyId, dto.roomId, dto.limit);
        return { items: rows.map((r) => this.serializeOrchestrationRun(r)) };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.programs.getActive')
  async programsGetActive(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationProgramsRoomDto, payload);
      return await this.runWithCompany(dto, async () => {
        const row = await this.collaborationPrograms.getActive({
          companyId: dto.companyId,
          roomId: dto.roomId,
          threadId: dto.threadId,
        });
        return { program: row };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.programs.listByRoom')
  async programsListByRoom(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationProgramsRoomDto, payload);
      return await this.runWithCompany(dto, async () => {
        const items = await this.collaborationPrograms.listByRoom(
          dto.companyId,
          dto.roomId,
          dto.limit,
        );
        return { items };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.programs.workerMutate')
  async programsWorkerMutate(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationProgramWorkerUpsertDto, payload);
      if (!dto.actor?.roles?.includes('admin')) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: '需要 Worker 管理员上下文',
        });
      }
      return await this.runWithCompany(dto, async () => {
        const action = dto.action ?? 'get_active';
        if (action === 'get_active') {
          const program = await this.collaborationPrograms.getActive({
            companyId: dto.companyId,
            roomId: dto.roomId,
            threadId: dto.threadId,
          });
          return { program };
        }
        if (action === 'create_intake') {
          const program = await this.collaborationPrograms.createIntake({
            companyId: dto.companyId,
            roomId: dto.roomId,
            threadId: dto.threadId,
            sourceMessageId: dto.sourceMessageId,
            brief: (dto.brief ?? undefined) as any,
            metadata: dto.metadata ?? null,
          });
          return { program };
        }
        if (action === 'transition') {
          const programId = String(dto.programId ?? '').trim();
          const phase = String(dto.phase ?? '').trim();
          if (!programId || !phase) {
            throw new BadRequestException({
              code: ErrorCode.BAD_REQUEST,
              message: 'programId 与 phase 必填',
            });
          }
          const program = await this.collaborationPrograms.transitionPhase({
            companyId: dto.companyId,
            programId,
            toPhase: phase as any,
            patch: {
              brief: (dto.brief ?? undefined) as any,
              goalUnderstanding: (dto.goalUnderstanding ?? undefined) as any,
              parentGoalTaskId: dto.parentGoalTaskId,
              dispatch: dto.dispatch,
              alignment: dto.alignment,
              metadata: dto.metadata,
            },
          });
          return { program };
        }
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '未知 programs worker action',
        });
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.programs.getTimeline')
  async programsGetTimeline(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationProgramTimelineDto, payload);
      return await this.runWithCompany(dto, async () => {
        const items = await this.programTimelineRead.listRecent({
          companyId: dto.companyId,
          programId: dto.programId,
          limit: dto.limit,
        });
        return { items };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.programs.confirm')
  async programsConfirm(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationProgramConfirmDto, payload);
      return await this.runWithCompany(dto, async () => {
        const program = await this.collaborationPrograms.confirmProgram({
          companyId: dto.companyId,
          programId: dto.programId,
          actorUserId: dto.actor.id,
        });
        return { program };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.mergeMetadata')
  async roomsMergeMetadata(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomMergeMetadataDto, payload);
      return await this.runWithCompany(dto, async () => {
        if (!dto.actor?.roles?.includes('admin')) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '需要管理员上下文',
          });
        }
        return this.rooms.mergeRoomMetadata(dto.companyId, dto.roomId, dto.metadata);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.threads.list')
  async threadsList(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationThreadsListDto, payload);
      return await this.runWithCompany(dto, async () => {
        const admin = dto.actor?.roles?.includes('admin');
        const member =
          admin ||
          (await this.members.isActiveMember(
            dto.companyId,
            dto.roomId,
            'human',
            dto.actor.id,
          ));
        if (!member) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '无权查看该房间线程',
          });
        }
        return this.threads.listByRoom(dto.companyId, dto.roomId);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.threads.create')
  async threadsCreate(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationThreadCreateDto, payload);
      return await this.runWithCompany(dto, async () => {
        const admin = dto.actor?.roles?.includes('admin');
        const member =
          admin ||
          (await this.members.isActiveMember(
            dto.companyId,
            dto.roomId,
            'human',
            dto.actor.id,
          ));
        if (!member) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '无权在该房间创建线程',
          });
        }
        return this.threads.create(dto.companyId, dto.roomId, {
          title: dto.title,
          collaborationMode: dto.collaborationMode,
        });
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.threads.update')
  async threadsUpdate(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationThreadUpdateDto, payload);
      return await this.runWithCompany(dto, async () => {
        const t = await this.threads.findOneOrFail(dto.companyId, dto.threadId);
        const admin = dto.actor?.roles?.includes('admin');
        const member =
          admin ||
          (await this.members.isActiveMember(
            dto.companyId,
            t.roomId,
            'human',
            dto.actor.id,
          ));
        if (!member) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '无权更新该线程',
          });
        }
        if (dto.collaborationMode !== undefined) {
          await this.threads.updateCollaborationMode(
            dto.companyId,
            dto.threadId,
            dto.collaborationMode,
          );
        }
        if (dto.status) {
          await this.threads.updateStatus(
            dto.companyId,
            dto.threadId,
            dto.status,
            dto.summary,
          );
        }
        return this.threads.findOneOrFail(dto.companyId, dto.threadId);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.threads.incrementRound')
  async threadsIncrementRound(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationThreadIncrementRoundDto, payload);
      return await this.runWithCompany(dto, async () => {
        if (!dto.actor?.roles?.includes('admin')) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '需要管理员上下文',
          });
        }
        return this.threads.incrementRound(dto.companyId, dto.threadId);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.threads.mergeMetadata')
  async threadsMergeMetadata(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationThreadMergeMetadataDto, payload);
      return await this.runWithCompany(dto, async () => {
        if (!dto.actor?.roles?.includes('admin')) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '需要管理员上下文',
          });
        }
        return this.threads.mergeMetadata(dto.companyId, dto.threadId, dto.metadata);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.patchMetadata')
  async messagesPatchMetadata(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesPatchMetadataDto, payload);
      return await this.runWithCompany(dto, async () => {
        if (!dto.actor?.roles?.includes('admin')) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '需要管理员上下文',
          });
        }
        return this.messages.patchMessageMetadata(
          dto.companyId,
          dto.messageId,
          dto.metadata,
        );
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.send')
  async messagesSend(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesSendDto, payload);
      return await this.runWithCompany(dto, () =>
        this.messages.sendHumanMessage(dto.companyId, dto.actor, {
          roomId: dto.roomId,
          threadId: dto.threadId,
          content: dto.content,
          messageType: dto.messageType,
          metadata: dto.metadata,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.taskIntentCandidates.patchSpec')
  async taskIntentCandidatesPatchSpec(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationTaskIntentCandidatePatchDto, payload);
      return await this.runWithCompany(dto, () =>
        this.taskIntentWorkflow.patchSpec({
          companyId: dto.companyId,
          actor: dto.actor,
          candidateId: dto.candidateId,
          patch: dto.patch,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.taskIntentCandidates.confirm')
  async taskIntentCandidatesConfirm(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationTaskIntentCandidateConfirmDto, payload);
      return await this.runWithCompany(dto, () =>
        this.taskIntentWorkflow.confirm({
          companyId: dto.companyId,
          actor: dto.actor,
          candidateId: dto.candidateId,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.list')
  async messagesList(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesListDto, payload);
      return await this.runWithCompany(dto, () =>
        this.messages.listMessages(dto.companyId, {
          roomId: dto.roomId,
          limit: dto.limit,
          beforeSeq: dto.beforeSeq,
          threadId: dto.threadId,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.get')
  async messagesGet(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesGetDto, payload);
      return await this.runWithCompany(dto, () =>
        this.messages.findMessageById(dto.companyId, dto.messageId),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.appendAgent')
  async messagesAppendAgent(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesAppendAgentDto, payload);
      return await this.runWithCompany(dto, () =>
        (async () => {
          await this.assertTemporaryAgentRoomScope({
            companyId: dto.companyId,
            roomId: dto.roomId,
            agentId: dto.agentId,
          });
          return this.messages.appendAgentMessage(
            dto.companyId,
            dto.roomId,
            dto.agentId,
            dto.content,
            dto.messageType ?? 'text',
            dto.metadata,
            dto.threadId ?? null,
            dto.memoryReferences ?? null,
          );
        })(),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.search')
  async messagesSearch(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesSearchRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.messages.searchMessages(dto.companyId, {
          roomId: dto.roomId,
          q: dto.q,
          senderType: dto.senderType,
          senderId: dto.senderId,
          from: dto.from,
          to: dto.to,
          limit: dto.limit,
          page: dto.page,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.members.list')
  async membersList(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomIdDto, payload);
      return await this.runWithCompany(dto, () =>
        this.members.listActiveMembers(dto.companyId, dto.roomId),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.members.add')
  async membersAdd(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMembersAddDto, payload);
      return await this.runWithCompany(dto, () =>
        this.dynamics.addRoomMembers(dto.companyId, dto.actor, {
          roomId: dto.roomId,
          members: dto.members,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.members.remove')
  async membersRemove(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMembersRemoveRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.dynamics.removeRoomMember(dto.companyId, dto.actor, {
          roomId: dto.roomId,
          memberType: dto.memberType,
          memberId: dto.memberId,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.room.summary.request')
  async roomSummaryRequest(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomSummaryRequestRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.summary.requestRoomSummary({
          companyId: dto.companyId,
          roomId: dto.roomId,
          requestedByUserId: dto.actor.id,
          mode: dto.mode,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('l1.decision.history')
  async l1DecisionHistory(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(L1DecisionHistoryRpcDto, payload);
      return await this.runWithCompany(dto, async () => {
        const admin = dto.actor?.roles?.includes('admin');
        const member =
          admin ||
          (await this.members.isActiveMember(
            dto.companyId,
            dto.roomId,
            'human',
            dto.actor.id,
          ));
        if (!member) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '无权查看该房间 L1 决策历史',
          });
        }
        const topK = Math.max(1, Math.min(100, dto.limit ?? 30));
        const hits = await this.memoryRetriever.search(
          `l1 decision history room:${dto.roomId}`,
          {
            companyId: dto.companyId,
            actor: dto.actor,
            namespaces: [`company:${dto.companyId}:l1:rlhf_data`],
            topK,
            minScore: 0,
            metadataContains: { roomId: dto.roomId },
          },
          { audit: { strategy: 'search', scope: 'personal' } },
        );
        return this.toL1DecisionFlowGraph(hits.slice(0, topK), dto.roomId);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.members.addFromOrganizationNode')
  async membersAddFromOrganizationNode(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMembersFromOrganizationNodeDto, payload);
      return await this.runWithCompany(dto, () =>
        this.dynamics.addMembersFromOrganizationNode(dto.companyId, dto.actor, {
          roomId: dto.roomId,
          organizationNodeId: dto.organizationNodeId,
          scope: dto.scope,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.createDepartment')
  async roomsCreateDepartment(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationCreateDepartmentRoomDto, payload);
      return await this.runWithCompany(dto, () =>
        this.dynamics.createDepartmentRoom(dto.companyId, dto.actor, {
          organizationNodeId: dto.organizationNodeId,
          name: dto.name,
          departmentSlug: dto.departmentSlug,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.findOrCreateDirect')
  async roomsFindOrCreateDirect(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationFindOrCreateDirectRoomDto, payload);
      return await this.runWithCompany(dto, () =>
        this.dynamics.findOrCreateDirectRoom(dto.companyId, dto.actor, dto.agentId, dto.agentName),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.organizationNodes.search')
  async organizationNodesSearch(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationOrgNodesSearchDto, payload);
      return await this.runWithCompany(dto, () =>
        this.dynamics.searchOrganizationNodes(
          dto.companyId,
          dto.q,
          dto.limit,
        ),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.ceoApprovals.resolve')
  async ceoApprovalResolve(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationCeoApprovalResolveRpcDto, payload);
      return await this.runWithCompany(dto, async () => {
        // HITL 安全红线：禁止非 Owner/Admin 绕过用户审批流程直接放行
        if (!dto.actor?.id) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '需要登录',
          });
        }

        // admin 角色默认信任（与 tasks.progress 逻辑保持一致）
        if (!dto.actor.roles?.includes('admin')) {
          const membership = await this.membershipsRepo.findOne({
            where: { companyId: dto.companyId, userId: dto.actor.id, isActive: true },
          });
          if (!membership || !['owner', 'admin'].includes(membership.role)) {
            throw new ForbiddenException({
              code: ErrorCode.FORBIDDEN,
              message: '仅公司 Owner/Admin 可审批 CEO',
            });
          }
        }

        // 安全红线：approvalId 不存在则必须失败，防止绕过 HITL
        // 通过 tasks.metadata.ceoApprovalId 与公司隔离（company_id）来校验
        const found = await this.tasksRepo
          .createQueryBuilder('t')
          .where('t.companyId = :companyId', { companyId: dto.companyId })
          .andWhere("t.metadata->>'ceoApprovalId' = :approvalId", { approvalId: dto.approvalId })
          .andWhere('t.requiresHumanApproval = true')
          .getCount();

        if (!found) {
          throw new BadRequestException({
            code: ErrorCode.BAD_REQUEST,
            message: 'approvalId 不存在或已过期',
          });
        }

        const decisionAt = new Date().toISOString();

        const resolved: AutonomousCeoApprovalResolvedEvent = {
          eventId: randomUUID(),
          eventType: 'autonomous.ceo.approval.resolved',
          aggregateId: dto.companyId,
          aggregateType: 'company',
          occurredAt: decisionAt,
          version: 1,
          companyId: dto.companyId,
          data: {
            companyId: dto.companyId,
            approvalId: dto.approvalId,
            decision: dto.decision,
            decisionAt,
            metadata: dto.note ? { note: dto.note } : undefined,
          },
        };

        await this.messaging.publish(resolved, {
          routingKey: resolved.eventType,
          persistent: true,
        });

        if (dto.decision === 'approved' || dto.decision === 'modified') {
          const approved: AutonomousCeoApprovalApprovedEvent = {
            eventId: randomUUID(),
            eventType: 'autonomous.ceo.approval.approved',
            aggregateId: dto.companyId,
            aggregateType: 'company',
            occurredAt: decisionAt,
            version: 1,
            companyId: dto.companyId,
            data: {
              companyId: dto.companyId,
              approvalId: dto.approvalId,
              decisionAt,
              metadata: dto.note ? { note: dto.note } : undefined,
            },
          };
          await this.messaging.publish(approved, {
            routingKey: approved.eventType,
            persistent: true,
          });
        }

        if (dto.decision === 'rejected') {
          const rejected: AutonomousCeoApprovalRejectedEvent = {
            eventId: randomUUID(),
            eventType: 'autonomous.ceo.approval.rejected',
            aggregateId: dto.companyId,
            aggregateType: 'company',
            occurredAt: decisionAt,
            version: 1,
            companyId: dto.companyId,
            data: {
              companyId: dto.companyId,
              approvalId: dto.approvalId,
              decisionAt,
              metadata: dto.note ? { note: dto.note } : undefined,
            },
          };
          await this.messaging.publish(rejected, {
            routingKey: rejected.eventType,
            persistent: true,
          });
        }

        // 持久化审批终态到聊天：避免前端刷新后回退成 pending 卡片。
        try {
          const roomId = await this.findAnyRoomByCeoApprovalId(dto.companyId, dto.approvalId);
          const ceoAgentId = await this.findCeoAgentId(dto.companyId);
          if (roomId && ceoAgentId) {
            const status = dto.decision === 'rejected' ? 'rejected' : dto.decision === 'modified' ? 'modified' : 'approved';
            const reason =
              status === 'approved'
                ? '已批准，可继续执行。'
                : status === 'modified'
                  ? '已要求修改，请根据意见调整后重提。'
                  : '已拒绝，本次执行已停止。';
            const note = dto.note?.trim() ? `\n说明：${dto.note.trim().slice(0, 500)}` : '';
            await this.messages.appendAgentMessage(
              dto.companyId,
              roomId,
              ceoAgentId,
              `【审批结果】approvalId=${dto.approvalId}，${reason}${note}`,
              'text',
              {
                source: 'ceo_approval_resolved',
                approvalCard: {
                  approvalId: dto.approvalId,
                  kind: 'ceo_autonomous',
                  reason,
                  status,
                  taskId: null,
                  provisional: false,
                  resolutionReason: dto.note?.trim() || undefined,
                },
              },
              null,
              null,
            );
          }
        } catch {
          // 不影响审批主流程
        }

        return { ok: true };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.mainRoomDraft.state.get')
  async mainRoomDraftStateGet(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMainRoomDraftGetDto, payload);
      return await this.runWithCompany(dto, () =>
        this.mainRoomDraftPatch.getDraftState({
          companyId: dto.companyId,
          roomId: dto.roomId,
          threadId: dto.threadId,
          actorUserId: dto.actor.id,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.mainRoomDraft.strategyGoal.patch')
  async mainRoomDraftStrategyGoalPatch(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMainRoomDraftPatchStrategyDto, payload);
      return await this.runWithCompany(dto, () =>
        this.mainRoomDraftPatch.patchStrategyGoal({
          companyId: dto.companyId,
          roomId: dto.roomId,
          threadId: dto.threadId,
          actorUserId: dto.actor.id,
          strategyGoal: dto.strategyGoal,
          strategicPhases: dto.strategicPhases,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.mainRoomDraft.distribution.patch')
  async mainRoomDraftDistributionPatch(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMainRoomDraftPatchDistributionDto, payload);
      return await this.runWithCompany(dto, () =>
        this.mainRoomDraftPatch.patchDistributionRows({
          companyId: dto.companyId,
          roomId: dto.roomId,
          threadId: dto.threadId,
          actorUserId: dto.actor.id,
          rows: dto.rows,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.dispatchPlanDraft.state.get')
  async dispatchPlanDraftStateGet(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationDispatchPlanDraftGetDto, payload);
      return await this.runWithCompany(dto, () =>
        this.mainRoomDispatchPlanPatch.getDraftState({
          companyId: dto.companyId,
          roomId: dto.roomId,
          threadId: dto.threadId,
          actorUserId: dto.actor.id,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.dispatchPlanDraft.patch')
  async dispatchPlanDraftPatch(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationDispatchPlanDraftPatchDto, payload);
      const order = String(dto.executionOrder ?? '').trim();
      const executionOrder =
        order === 'parallel' || order === 'dag' || order === 'sequential' ? order : undefined;
      return await this.runWithCompany(dto, () =>
        this.mainRoomDispatchPlanPatch.patchDispatchPlanDraft({
          companyId: dto.companyId,
          roomId: dto.roomId,
          threadId: dto.threadId,
          actorUserId: dto.actor.id,
          goal: dto.goal,
          bodyMarkdown: dto.bodyMarkdown,
          assignments: dto.assignments.map((a) => ({
            departmentSlug: a.departmentSlug,
            title: a.title,
            objective: a.objective,
            acceptanceCriteria: a.acceptanceCriteria ?? [],
            dependsOnSlugs: a.dependsOnSlugs,
            priority:
              a.priority === 'P0' || a.priority === 'P1' || a.priority === 'P2' ? a.priority : undefined,
          })),
          executionOrder,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.mentionAliases.list')
  async mentionAliasesList(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMentionAliasesListDto, payload);
      return await this.runWithCompany(dto, () => this.mentionAliases.list(dto.companyId));
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.mentionAliases.upsert')
  async mentionAliasesUpsert(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMentionAliasesUpsertDto, payload);
      return await this.runWithCompany(dto, () =>
        this.mentionAliases.upsert(dto.companyId, dto.actor, dto.alias as any),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.mentionAliases.remove')
  async mentionAliasesRemove(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMentionAliasesRemoveDto, payload);
      return await this.runWithCompany(dto, () =>
        this.mentionAliases.remove(dto.companyId, dto.actor, dto.label),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.director.reportProgress')
  async directorReportProgress(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationDirectorProgressReportRpcDto, payload);
      return await this.runWithCompany(dto, async () => {
        await this.rooms.findOneOrFail(dto.companyId, dto.roomId);
        const director = await this.agentsRepo.findOne({
          where: { id: dto.directorAgentId, companyId: dto.companyId, role: 'director' } as any,
        });
        if (!director) {
          throw new BadRequestException({
            code: ErrorCode.BAD_REQUEST,
            message: 'directorAgentId 不存在或角色不匹配',
          });
        }
        const active = await this.members.isActiveMember(
          dto.companyId,
          dto.roomId,
          'agent',
          dto.directorAgentId,
        );
        if (!active) {
          await this.members.addMembers(dto.companyId, dto.roomId, [
            { memberType: 'agent', memberId: dto.directorAgentId },
          ]);
        }
        const content = JSON.stringify(
          {
            reportType: dto.reportType,
            generatedAt: new Date().toISOString(),
            report: dto.report,
          },
          null,
          2,
        );
        const message = await this.messages.appendAgentMessage(
          dto.companyId,
          dto.roomId,
          dto.directorAgentId,
          content,
          'system',
          {
            kind: 'director_progress_report',
            tags: ['reporting', 'department'],
            reportType: dto.reportType,
            idempotencyHint: `director-report:${dto.directorAgentId}:${dto.reportType}`,
          },
          null,
          null,
        );
        const evt: BaseEvent & {
          data: {
            companyId: string;
            directorAgentId: string;
            roomId: string;
            reportType: string;
            messageId: string;
          };
        } = {
          eventId: randomUUID(),
          eventType: 'director.progress.reported',
          aggregateId: dto.directorAgentId,
          aggregateType: 'agent',
          occurredAt: new Date().toISOString(),
          version: 1,
          companyId: dto.companyId,
          data: {
            companyId: dto.companyId,
            directorAgentId: dto.directorAgentId,
            roomId: dto.roomId,
            reportType: dto.reportType,
            messageId: message.id,
          },
        };
        await this.messaging.publish(evt, { routingKey: 'director.progress.reported', persistent: true });
        return { ok: true, messageId: message.id };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /**
   * L3 Temporal 重构 Step 8: Admin Observability Panel
   */
  @MessagePattern('collaboration.heavy.workflows.list')
  async heavyWorkflowsList(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationHeavyWorkflowsListRpcDto, payload);
      const targetCompanyId = String(dto.companyIdOverride ?? dto.companyId).trim();
      return await this.runWithCompany({ companyId: targetCompanyId }, () =>
        this.heavyTemporalClient.listOpenWorkflows(targetCompanyId),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /**
   * L3 Temporal 重构 Step 8: Admin Observability Panel
   */
  @MessagePattern('collaboration.heavy.workflows.get')
  async heavyWorkflowsGet(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationHeavyWorkflowGetRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.heavyTemporalClient.describeWorkflow(dto.workflowId),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /**
   * L3 Temporal 重构 Step 8: Admin Observability Panel
   */
  @MessagePattern('collaboration.heavy.workflows.signal')
  async heavyWorkflowsSignal(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationHeavyWorkflowSignalRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.heavyTemporalClient.signalWorkflow({
          workflowId: dto.workflowId,
          signalType: dto.signalType,
          payload: {
            approvalRequestId: dto.approvalRequestId ?? '',
            decision: dto.decision ?? 'approve',
            reason: dto.reason ?? '',
          },
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private serializeOrchestrationRun(row: CollaborationOrchestrationRun) {
    return {
      id: row.id,
      companyId: row.companyId,
      roomId: row.roomId,
      sourceMessageId: row.sourceMessageId,
      workerRunId: row.workerRunId,
      status: row.status,
      stage: row.stage,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      metadata: row.metadata,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    };
  }

  private runWithCompany<T>(
    dto: { companyId: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.tenantContext.runWithCompanyId(dto.companyId, fn);
  }

  private toL1DecisionFlowGraph(hits: MemorySearchHit[], roomId: string) {
    const ordered = [...hits].sort((a, b) => {
      const ta = Date.parse(String(a.createdAt ?? '')) || 0;
      const tb = Date.parse(String(b.createdAt ?? '')) || 0;
      return ta - tb;
    });
    const nodes = ordered.map((h, index) => {
      let rawDecision: unknown = null;
      let finalDecision: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(String(h.content ?? '{}')) as Record<string, unknown>;
        rawDecision = parsed.rawDecision ?? null;
        finalDecision =
          parsed.finalDecision && typeof parsed.finalDecision === 'object'
            ? (parsed.finalDecision as Record<string, unknown>)
            : null;
      } catch {
        rawDecision = null;
      }
      const mode =
        typeof finalDecision?.mode === 'string'
          ? finalDecision.mode
          : typeof rawDecision === 'string'
            ? rawDecision
            : 'discussion';
      const confidence = Number(finalDecision?.confidence ?? 0);
      const reasoning =
        typeof finalDecision?.reasoning === 'string'
          ? finalDecision.reasoning
          : typeof rawDecision === 'string'
            ? rawDecision
            : '';
      return {
        id: h.id,
        type: 'l1DecisionNode',
        position: { x: index * 280, y: 80 },
        data: {
          roomId,
          mode,
          confidence,
          reasoning,
          timestamp: h.createdAt ?? null,
          rawDecision,
          finalDecision,
          score: h.score,
          metadata: h.metadata ?? null,
        },
      };
    });
    const edges = nodes.slice(1).map((n, i) => ({
      id: `edge-${nodes[i].id}-${n.id}`,
      source: nodes[i].id,
      target: n.id,
      type: 'smoothstep',
    }));
    return { roomId, nodes, edges, count: nodes.length };
  }

  private toRpcError(e: any): RpcException {
    if (e?.getStatus && e?.getResponse) {
      return new RpcException({
        status: e.getStatus(),
        response: e.getResponse(),
        message: e.message,
      });
    }
    return e instanceof RpcException
      ? e
      : new RpcException({
          status: 500,
          message: e?.message ?? 'Internal error',
        });
  }
}
