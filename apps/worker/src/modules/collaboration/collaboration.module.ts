import { forwardRef, Module } from '@nestjs/common';
import { createRequire } from 'node:module';
import { CeoV2OrchestrationService } from './ceo/v2/ceo-v2-orchestration.service.js';
import { CeoV2PlanningAssignablePoolService } from './ceo/v2/ceo-v2-planning-assignable-pool.service.js';
import { CeoV2SupervisionService } from './ceo/v2/ceo-v2-supervision.service.js';
import { CeoV2TemporalService } from './ceo/v2/ceo-v2-temporal.service.js';
import { CollaborationPipelineV2Service } from './pipeline-v2/collaboration-pipeline-v2.service.js';
import { CollaborationPipelineRuleFallbackService } from './pipeline-v2/pipeline-rule-fallback.service.js';
import { CollaborationMainRoomFlowService } from './pipeline-v2/main-room-flow.service.js';
import { CollaborationMainRoomIntentService } from './pipeline-v2/main-room-intent.service.js';
import { CollaborationMainRoomOrchestrationService } from './pipeline-v2/main-room-orchestration.service.js';
import { CollaborationMainRoomOrchestrationReplyService } from './pipeline-v2/main-room-orchestration-reply.service.js';
import { CollaborationMainRoomSupervisionService } from './pipeline-v2/main-room-supervision.service.js';
import { CollaborationMainRoomReplayService } from './pipeline-v2/main-room-replay.service.js';
import { DepartmentDirectorService } from './director/department-director.service.js';
import { EmployeeExecutionService } from './employee/employee-execution.service.js';
import { UnifiedDeliverableExecutorService } from './deliverable/unified-deliverable-executor.service.js';
import { DeliverableGateService } from './deliverable/deliverable-gate.service.js';
import { CollaborationPipelineV2Listener } from './pipeline-v2/collaboration-pipeline-v2.listener.js';
import { ResponderThinkingPublisher } from './pipeline-v2/responder-thinking.publisher.js';
import { MainRoomRoundtableListener } from './listeners/main-room-roundtable.listener.js';
import { AgentPeerSummonListener } from './listeners/agent-peer-summon.listener.js';
import { AgentPeerSummonService } from './agent-peer-summon/agent-peer-summon.service.js';
import { CollaborationModeRoomContextListener } from './listeners/collaboration-mode-room-context.listener.js';
import { CollaborationRoomModeSyncService } from './collaboration-room-mode-sync.service.js';
import { MainRoomRoundtableService } from './main-room-roundtable.service.js';
import { CollaborationPipelineV2Coordinator } from './pipeline-v2/collaboration-pipeline-v2.coordinator.js';
import { BillingWorkerModule } from '../billing/billing-worker.module.js';
import { FileAssetsWorkerModule } from '../file-assets/file-assets-worker.module.js';
import { ResilienceModule } from '../../common/resilience/resilience.module.js';
import { DirectCollabReplyService } from './direct-collab-reply.service.js';
import { DirectReplyStreamPublisherService } from './direct-reply/direct-reply-stream-publisher.service.js';
import { CollaborationLlmTokenStreamService } from './llm/collaboration-llm-token-stream.service.js';
import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';
import { CollaborationLlmKeyPoolCacheService } from './collaboration-llm-key-pool-cache.service.js';
import { CeoNaturalReplyGeneratorService } from './ceo-natural-reply-generator.service.js';
import { GroupChatContextService } from './group-chat-context.service.js';
import { ConversationStateRedisCacheService } from './conversation-state-redis-cache.service.js';
import { CeoLayerConfig } from './ceo/config/ceo-layer.config.js';
import { CeoLayerConfigResolverService } from './ceo/resolver/ceo-layer-config-resolver.service.js';
import { CeoLayerOpenAiToolsService } from './ceo/ceo-layer-open-ai-tools.service.js';
import { DecisionConfigResolverService } from './ceo/resolver/decision-config-resolver.service.js';
import { LLMRoutingRuleEnforcer } from '../../common/llm-rules/llm-routing-rule.enforcer.js';
import { RateLimitGuardService } from './rate-limit/rate-limit-guard.service.js';
import { DegradationPolicyService } from './degradation/degradation-policy.service.js';
import { L1FeatureFlagService } from './l1/l1-feature-flag.service.js';
import { Phase3RolloutService } from './rollout/rollout-service.js';
import { PHASE3_L1_ROLLOUT_DELEGATE } from './rollout/phase3-rollout.tokens.js';
import { PreContextService } from './l1/pre-context.service.js';
import { L1ClassifierCoreService } from './l1/l1-classifier-core.service.js';
import { L1PostNormalizerService } from './l1/l1-post-normalizer.service.js';
import { AgentsModule } from '../agents/agents.module.js';
import { IntentPreviewInternalController } from './intent/intent-preview-internal.controller.js';
import { ContextCompressionService } from './context-compression.service.js';
import { MemoryContextAssemblerService } from './memory-context-assembler.service.js';
import { ApprovalStatusChatListener } from './listeners/approval-status-chat.listener.js';
import { CapabilityPolicyService } from './facts/capability-policy.service.js';
import { FactsGatewayClient } from './facts/facts-gateway.client.js';
import { OrgContextPackService } from './org-context-pack.service.js';
import { MemoryGatewayClient } from './facts/memory-gateway.client.js';
import { CeoV2ToolsService } from './ceo/v2/tools/ceo-v2-tools.service.js';
import { CompanyCortexService } from '../company-runtime/company-cortex.service.js';
import { RoomContextService } from './context/room-context.service.js';
import { AgentsActiveDirectoryCacheService } from './context/agents-active-directory-cache.service.js';
import { DepartmentDirectReplyService } from './director/department-direct-reply.service.js';
import { DepartmentRoomInteractionClassifierService } from './director/department-room-interaction-classifier.service.js';
import { IntentLayerService } from './intent/intent-layer.service.js';
import { ContextGroundingPlannerService } from './context/context-grounding-planner.service.js';
import { SummonTargetResolverService } from './intent/summon-target-resolver.service.js';
import { IntentDirectorMemoryShadowService } from './intent/intent-director-memory-shadow.service.js';
import { MainRoomAudienceRoutingContextService } from './intent/main-room-audience-routing-context.service.js';
import { MainRoomDirectorIntentValidationService } from './intent/main-room-director-intent-validation.service.js';
import { MemoryCrossCutService } from './memory/memory-cross-cut.service.js';
import { RlhfSamplerService } from './rlhf/rlhf-sampler.service.js';
import { MainRoomFollowupRouteHintService } from './main-room-followup-route-hint.service.js';
import { MainRoomCeoGroundingService } from './main-room-ceo-grounding.service.js';
import { ReplayCanonicalToolLoopService } from './replay/replay-canonical-tool-loop.service.js';
import { MainRoomReplayExecutionDelegateService } from './main-room-replay-execution-delegate.service.js';
import { CeoSequentialPeerIntroSessionService } from './replay/ceo-sequential-peer-intro-session.service.js';
import { CeoSequentialPeerIntroContinuationService } from './replay/ceo-sequential-peer-intro-continuation.service.js';
import { ReplayPeerSummonDirectService } from './replay/replay-peer-summon-direct.service.js';
import { MainRoomCeoAlignmentSessionService } from './main-room-ceo-alignment-session.service.js';
import { MainRoomReplayMetadataService } from './replay/main-room-replay-metadata.service.js';
import { MainRoomReplaySsotPublisherService } from './replay/main-room-replay-ssot-publisher.service.js';
import { MainRoomReplayLlmContextService } from './main-room-replay-llm-context.service.js';
import { MainRoomCeoTurnStateService } from './main-room-ceo-turn-state.service.js';
import { MainRoomStrategyDraftSessionService } from './main-room-strategy-draft-session.service.js';
import { MainRoomDispatchCompensationService } from './dispatch/main-room-dispatch-compensation.service.js';
import { CollabNotifyPublisherService } from './collab-notify-publisher.service.js';
import { RedisCacheService } from '../../common/cache/redis-cache.service.js';
import { CollabRedisCacheService } from '../../common/cache/collab-redis-cache.service.js';
import { CollaborationSessionLeaseService } from './session/collaboration-session-lease.service.js';
import { CollaborationRetrievalPlannerService } from './memory/collaboration-retrieval-planner.service.js';
import { CollaborationAssignmentValidatorService } from './assignment/collaboration-assignment-validator.service.js';
import { AgentMessageDispatcherService } from './agent-message-dispatcher.service.js';
import { CollaborationDomainEventPublisher } from './domain/collaboration-domain-event-publisher.service.js';
import { DirectorAutonomousService } from './director/director-autonomous.service.js';
import { EmployeeAutonomousService } from '../agents/employee-autonomous.service.js';
import { DIRECT_COLLAB_REPLY_DELEGATE } from '../agents/direct-collab-reply-delegate.js';
import { DirectCollabAgentReplyDelegateService } from './direct-collab-agent-reply-delegate.service.js';
import { AgentDirectSkillToolsService } from './direct/agent-direct-skill-tools.service.js';
import { AgentDirectSkillToolLoopService } from './direct/agent-direct-skill-tool-loop.service.js';
import { HrStaffingSurveyExecutorService } from './direct/hr-staffing-survey-executor.service.js';
import { CollaborationDeptReportBufferService } from './dept-report/collaboration-dept-report-buffer.service.js';
import { CollaborationDeptReportService } from './dept-report/collaboration-dept-report.service.js';
import {
  EmployeeDeptReportListener,
  TaskCompletedEmployeeDeptReportListener,
} from './listeners/employee-dept-report.listener.js';
import { DirectorDeptReportMainRoomListener } from './listeners/director-dept-report-main-room.listener.js';
import { L2AutoCompleteOnDeptReportListener } from './listeners/l2-auto-complete-on-dept-report.listener.js';
import { CollaborationProgramClientService } from './program/collaboration-program-client.service.js';
import { MainRoomProgramOrchestrator } from './program/main-room-program.orchestrator.js';
import { CollaborationProgramTimelineService } from './program/collaboration-program-timeline.service.js';
import { CollaborationProgramLifecycleService } from './program/collaboration-program-lifecycle.service.js';
import { CollaborationTurnService } from './turn/collaboration-turn.service.js';
import { CollaborationTurnToolLoopService } from './turn/collaboration-turn-tool-loop.service.js';
import { CollaborationOrchestrateToolHandler } from './turn/collaboration-orchestrate-tool.handler.js';
import { MainRoomOrchestrationPauseService } from './orchestration/main-room-orchestration-pause.service.js';
import { AgentToolLoopService } from './agent-tool-loop.service.js';

const require = createRequire(import.meta.url);

@Module({
  imports: [
    ResilienceModule,
    BillingWorkerModule,
    FileAssetsWorkerModule,
    forwardRef(() => require('../autonomous/autonomous.module.js').AutonomousModule),
    forwardRef(() => AgentsModule),
  ],
  providers: [
    CeoV2PlanningAssignablePoolService,
    CeoV2OrchestrationService,
    CeoV2SupervisionService,
    CeoV2TemporalService,
    DirectCollabReplyService,
    DirectReplyStreamPublisherService,
    CollaborationLlmTokenStreamService,
    CollaborationPipelineV2Service,
    CollaborationPipelineRuleFallbackService,
    CollaborationMainRoomFlowService,
    CollaborationMainRoomIntentService,
    CollaborationMainRoomOrchestrationReplyService,
    CollaborationMainRoomOrchestrationService,
    CollaborationMainRoomSupervisionService,
    CollaborationMainRoomReplayService,
    CollaborationPipelineV2Listener,
    ResponderThinkingPublisher,
    MainRoomRoundtableService,
    MainRoomRoundtableListener,
    AgentPeerSummonService,
    AgentPeerSummonListener,
    CollaborationModeRoomContextListener,
    CollaborationRoomModeSyncService,
    CollaborationPipelineV2Coordinator,
    CollaborationLlmKeyPoolCacheService,
    CollaborationLlmBridgeService,
    CeoNaturalReplyGeneratorService,
    GroupChatContextService,
    ConversationStateRedisCacheService,
    CeoLayerConfig,
    CeoLayerConfigResolverService,
    CeoLayerOpenAiToolsService,
    DecisionConfigResolverService,
    LLMRoutingRuleEnforcer,
    RateLimitGuardService,
    DegradationPolicyService,
    L1FeatureFlagService,
    {
      provide: PHASE3_L1_ROLLOUT_DELEGATE,
      useExisting: L1FeatureFlagService,
    },
    Phase3RolloutService,
    PreContextService,
    L1ClassifierCoreService,
    L1PostNormalizerService,
    ContextCompressionService,
    MemoryContextAssemblerService,
    ApprovalStatusChatListener,
    CapabilityPolicyService,
    FactsGatewayClient,
    OrgContextPackService,
    MemoryGatewayClient,
    CeoV2ToolsService,
    ReplayCanonicalToolLoopService,
    CompanyCortexService,
    IntentLayerService,
    ContextGroundingPlannerService,
    SummonTargetResolverService,
    MainRoomAudienceRoutingContextService,
    IntentDirectorMemoryShadowService,
    MainRoomDirectorIntentValidationService,
    AgentsActiveDirectoryCacheService,
    RoomContextService,
    DepartmentRoomInteractionClassifierService,
    DepartmentDirectReplyService,
    DepartmentDirectorService,
    EmployeeExecutionService,
    UnifiedDeliverableExecutorService,
    DeliverableGateService,
    MemoryCrossCutService,
    CollaborationRetrievalPlannerService,
    CollaborationSessionLeaseService,
    CollaborationAssignmentValidatorService,
    RlhfSamplerService,
    RedisCacheService,
    CollabRedisCacheService,
    MainRoomFollowupRouteHintService,
    MainRoomReplayLlmContextService,
    MainRoomCeoGroundingService,
    MainRoomReplayExecutionDelegateService,
    CeoSequentialPeerIntroSessionService,
    CeoSequentialPeerIntroContinuationService,
    ReplayPeerSummonDirectService,
    MainRoomCeoTurnStateService,
    MainRoomStrategyDraftSessionService,
    MainRoomCeoAlignmentSessionService,
    MainRoomReplayMetadataService,
    MainRoomReplaySsotPublisherService,
    CollabNotifyPublisherService,
    MainRoomDispatchCompensationService,
    MainRoomOrchestrationPauseService,
    AgentToolLoopService,
    CollaborationProgramClientService,
    CollaborationProgramTimelineService,
    CollaborationProgramLifecycleService,
    MainRoomProgramOrchestrator,
    CollaborationTurnService,
    CollaborationTurnToolLoopService,
    CollaborationOrchestrateToolHandler,
    CollaborationDeptReportBufferService,
    CollaborationDeptReportService,
    EmployeeDeptReportListener,
    TaskCompletedEmployeeDeptReportListener,
    DirectorDeptReportMainRoomListener,
    L2AutoCompleteOnDeptReportListener,
    AgentMessageDispatcherService,
    CollaborationDomainEventPublisher,
    DirectorAutonomousService,
    EmployeeAutonomousService,
    AgentDirectSkillToolsService,
    AgentDirectSkillToolLoopService,
    HrStaffingSurveyExecutorService,
    DirectCollabAgentReplyDelegateService,
    {
      provide: DIRECT_COLLAB_REPLY_DELEGATE,
      useExisting: DirectCollabAgentReplyDelegateService,
    },
  ],
  controllers: [IntentPreviewInternalController],
  exports: [
    CollaborationPipelineV2Service,
    CollaborationLlmBridgeService,
    MemoryContextAssemblerService,
    CeoV2OrchestrationService,
    CeoV2SupervisionService,
    DepartmentDirectorService,
    EmployeeExecutionService,
    UnifiedDeliverableExecutorService,
    DeliverableGateService,
    CeoLayerConfigResolverService,
    DegradationPolicyService,
    CapabilityPolicyService,
    FactsGatewayClient,
    OrgContextPackService,
    MemoryGatewayClient,
    CeoV2ToolsService,
    PreContextService,
    L1ClassifierCoreService,
    L1PostNormalizerService,
    L1FeatureFlagService,
    Phase3RolloutService,
    CeoNaturalReplyGeneratorService,
    CollaborationDomainEventPublisher,
    CollaborationDeptReportService,
    CollaborationDeptReportBufferService,
    EmployeeAutonomousService,
    DIRECT_COLLAB_REPLY_DELEGATE,
    CollaborationSessionLeaseService,
    CollaborationRetrievalPlannerService,
    CollaborationAssignmentValidatorService,
    AgentToolLoopService,
  ],
})
export class CollaborationModule {}
