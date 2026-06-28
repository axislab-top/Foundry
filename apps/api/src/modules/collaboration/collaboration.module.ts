import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '../../common/cache/cache.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { Company } from '../companies/entities/company.entity.js';
import { CompanyHeartbeatConfig } from '../companies/entities/company-heartbeat-config.entity.js';
import { OrganizationModule } from '../organization/organization.module.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { Task } from '../tasks/entities/task.entity.js';
import { CollaborationRpcController } from './collaboration.rpc.controller.js';
import { CollaborationMessageProcessingController } from './collaboration-message-processing.controller.js';
import { AudienceRouterService } from './audience/audience-router.service.js';
import { ChatMessage } from './entities/chat-message.entity.js';
import { ChatRoom } from './entities/chat-room.entity.js';
import { DiscussionThread } from './entities/discussion-thread.entity.js';
import { MessageActionCandidate } from './entities/message-action-candidate.entity.js';
import { MessageProcessingDecision } from './entities/message-processing-decision.entity.js';
import { MessageProcessingJob } from './entities/message-processing-job.entity.js';
import { ReplayDecision } from './entities/replay-decision.entity.js';
import { TaskIntentCandidate } from './entities/task-intent-candidate.entity.js';
import { RoomMember } from './entities/room-member.entity.js';
import { CompanyCreatedCollaborationListener } from './listeners/company-created-collaboration.listener.js';
import { AgentCreatedCollaborationListener } from './listeners/agent-created-collaboration.listener.js';
import { OrganizationNodeCreatedCollaborationListener } from './listeners/organization-node-created-collaboration.listener.js';
import { CollaborationOrgSyncService } from './services/collaboration-org-sync.service.js';
import { ChatMessageService } from './services/chat-message.service.js';
import { ChatRoomService } from './services/chat-room.service.js';
import { CollaborationApprovalNotifier } from './services/collaboration-approval-notifier.service.js';
import { CollaborationBootstrapService } from './services/collaboration-bootstrap.service.js';
import { CollaborationDynamicsService } from './services/collaboration-dynamics.service.js';
import { CollaborationRealtimePublisher } from './services/collaboration-realtime-publisher.service.js';
import { CollaborationRoleRoutingService } from './services/collaboration-role-routing.service.js';
import { CollaborationSummaryService } from './services/collaboration-summary.service.js';
import { TaskGovernanceSummaryService } from './services/task-governance-summary.service.js';
import { MentionAliasesService } from './services/mention-aliases.service.js';
import { RoomMemberService } from './services/room-member.service.js';
import { DiscussionThreadService } from './services/discussion-thread.service.js';
import { MessageActionCandidateService } from './services/message-action-candidate.service.js';
import { MessageProcessingDecisionService } from './services/message-processing-decision.service.js';
import { MessageProcessingJobService } from './services/message-processing-job.service.js';
import { MessageProcessingOrchestratorService } from './services/message-processing-orchestrator.service.js';
import { MessageProcessingPolicyService } from './services/message-processing-policy.service.js';
import { MessageProcessingPublisherService } from './services/message-processing-publisher.service.js';
import { MessageProcessingWorkerService } from './services/message-processing-worker.service.js';
import { MessageProcessingSchedulerService } from './services/message-processing-scheduler.service.js';
import { CollaborationMessageInboundPublisherService } from './services/collaboration-message-inbound-publisher.service.js';
import { AgentPeerSummonInternalService } from './services/agent-peer-summon-internal.service.js';
import { MessageProcessingEventFactory } from './services/message-processing-event.factory.js';
import { TaskIntentCandidateService } from './services/task-intent-candidate.service.js';
import { ReplayDecisionService } from './replay/replay-decision.service.js';
import { ExecutionIntakeService } from './execution-intake/execution-intake.service.js';
import { TaskMaterializerService } from './execution-intake/task-materializer.service.js';
import { TaskIntentWorkflowService } from './execution-intake/task-intent-workflow.service.js';
import { MemoryModule } from '../memory/memory.module.js';
import { CollaborationRoomSummaryProcessorListener } from './listeners/collaboration-room-summary.processor.listener.js';
import { TaskGovernanceSummaryListener } from './listeners/task-governance-summary.listener.js';
import { AutonomousCeoApprovalListener } from './listeners/autonomous-ceo-approval.listener.js';
import { CollaborationAgentMessageAckListener } from './listeners/collaboration-agent-message-ack.listener.js';
import { HeavyTemporalClientService } from './services/heavy-temporal-client.service.js';
import { HeavyWorkflowController } from './heavy-workflow.controller.js';
import { CollaborationE2EInternalController } from './collaboration-e2e-internal.controller.js';
import { MainRoomDraftPatchService } from './services/main-room-draft-patch.service.js';
import { MainRoomDispatchPlanPatchService } from './services/main-room-dispatch-plan-patch.service.js';
import { CollaborationOrchestrationRun } from './entities/collaboration-orchestration-run.entity.js';
import { CollaborationProgram } from './entities/collaboration-program.entity.js';
import { CollaborationOrchestrationRunsService } from './services/collaboration-orchestration-runs.service.js';
import { CollaborationProgramsService } from './services/collaboration-programs.service.js';
import { CollaborationProgramTimelineReadService } from './services/collaboration-program-timeline-read.service.js';
import { MainRoomSessionAccessService } from './services/main-room-session-access.service.js';
import { CollaborationMessageProcessFailedListener } from './listeners/collaboration-message-process-failed.listener.js';
import { TaskGovernanceReportListener } from './listeners/task-governance-report.listener.js';
import { DepartmentTaskStageMessageListener } from './listeners/department-task-stage-message.listener.js';
import { MainRoomReplayDelegateCompletedListener } from './listeners/main-room-replay-delegate-completed.listener.js';
import { WorkerReplayDecisionIngestService } from './replay/worker-replay-decision-ingest.service.js';
import { MessagingModule } from '@service/messaging';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatRoom,
      ChatMessage,
      DiscussionThread,
      RoomMember,
      Agent,
      Company,
      CompanyMembership,
      CompanyHeartbeatConfig,
      OrganizationNode,
      Task,
      CollaborationOrchestrationRun,
      CollaborationProgram,
      MessageActionCandidate,
      MessageProcessingDecision,
      MessageProcessingJob,
      ReplayDecision,
      TaskIntentCandidate,
    ]),
    CacheModule,
    forwardRef(() => AgentsModule),
    forwardRef(() => OrganizationModule),
    forwardRef(() => MemoryModule),
    MessagingModule,
  ],
  controllers: [
    CollaborationRpcController,
    CollaborationMessageProcessingController,
    HeavyWorkflowController,
    CollaborationE2EInternalController,
  ],
  providers: [
    ChatRoomService,
    DiscussionThreadService,
    RoomMemberService,
    ChatMessageService,
    AudienceRouterService,
    CollaborationBootstrapService,
    CollaborationOrgSyncService,
    CollaborationRealtimePublisher,
    CollaborationDynamicsService,
    CollaborationSummaryService,
    TaskGovernanceSummaryService,
    MentionAliasesService,
    CollaborationRoleRoutingService,
    MessageProcessingPolicyService,
    MessageActionCandidateService,
    MessageProcessingDecisionService,
    MessageProcessingJobService,
    MessageProcessingOrchestratorService,
    MessageProcessingWorkerService,
    MessageProcessingPublisherService,
    MessageProcessingSchedulerService,
    MessageProcessingEventFactory,
    CollaborationMessageInboundPublisherService,
    AgentPeerSummonInternalService,
    TaskIntentCandidateService,
    ReplayDecisionService,
    WorkerReplayDecisionIngestService,
    ExecutionIntakeService,
    TaskMaterializerService,
    TaskIntentWorkflowService,
    CollaborationApprovalNotifier,
    CompanyCreatedCollaborationListener,
    AgentCreatedCollaborationListener,
    OrganizationNodeCreatedCollaborationListener,
    CollaborationRoomSummaryProcessorListener,
    TaskGovernanceSummaryListener,
    AutonomousCeoApprovalListener,
    CollaborationAgentMessageAckListener,
    HeavyTemporalClientService,
    MainRoomDraftPatchService,
    MainRoomDispatchPlanPatchService,
    MainRoomSessionAccessService,
    CollaborationOrchestrationRunsService,
    CollaborationProgramsService,
    CollaborationProgramTimelineReadService,
    CollaborationMessageProcessFailedListener,
    TaskGovernanceReportListener,
    DepartmentTaskStageMessageListener,
    MainRoomReplayDelegateCompletedListener,
  ],
  exports: [
    ChatRoomService,
    DiscussionThreadService,
    RoomMemberService,
    ChatMessageService,
    AgentPeerSummonInternalService,
    CollaborationBootstrapService,
    CollaborationOrgSyncService,
    CollaborationDynamicsService,
    CollaborationSummaryService,
    MentionAliasesService,
    CollaborationRoleRoutingService,
    CollaborationApprovalNotifier,
    CollaborationRealtimePublisher,
    HeavyTemporalClientService,
    MainRoomDraftPatchService,
    MainRoomDispatchPlanPatchService,
    CollaborationOrchestrationRunsService,
    CollaborationProgramsService,
  ],
})
export class CollaborationModule {}
