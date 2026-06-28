import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  MetricsManager,
  createMetricsConfigFromEnv,
  type Counter,
  type Gauge,
  type Histogram,
} from '@service/monitoring';

/**
 * 监控服务（Worker）
 * 使用 @service/monitoring 初始化全局 MetricsManager
 */
@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private metricsManager: MetricsManager | null = null;
  private taskRunOutcome: Counter | null = null;
  private companyHeartbeatLifecycleTotal: Counter | null = null;
  private companySnapshotCapturedTotal: Counter | null = null;
  private companyReportPublishedTotal: Counter | null = null;
  private ceoHeartbeatDuration: Histogram | null = null;
  private directorFanoutOutcome: Counter | null = null;
  private aggregationDuration: Histogram | null = null;
  private heartbeatMemoryIngestOutcome: Counter | null = null;
  private collaborationAutoJoinedOutcome: Counter | null = null;
  private collaborationAutoJoinedDuration: Histogram | null = null;
  private collaborationReplyDuration: Histogram | null = null;
  private collaborationReplyFirstTokenDuration: Histogram | null = null;
  private collaborationReplyChunkMergedCount: Counter | null = null;
  private collaborationReplyChunkOriginalCount: Counter | null = null;
  private approvalRequiredTotal: Counter | null = null;
  private approvalOutcomeTotal: Counter | null = null;
  private approvalLatency: Histogram | null = null;
  private taskExecutionResumedAfterApprovalTotal: Counter | null = null;
  private taskExecutionBlockedByApprovalTotal: Counter | null = null;
  private supervisorReviewTotal: Counter | null = null;
  private supervisorReviewLatency: Histogram | null = null;
  private supervisorFindingsTotal: Counter | null = null;
  private supervisorReviewQualityScore: Histogram | null = null;
  private parallelDiscussionTotal: Counter | null = null;
  private parallelAgentCount: Histogram | null = null;
  private discussionMergeLatencySeconds: Histogram | null = null;
  private structuredOutputParseFailures: Counter | null = null;
  private l2StructuredOutputTotal: Counter | null = null;
  private memoryPermissionDeniedTotal: Counter | null = null;
  private memoryFallbackToCompanyTotal: Counter | null = null;
  private ceoHeartbeatPlanningFallbackTotal: Counter | null = null;
  private ceoPlanningRepairAttemptsTotal: Counter | null = null;
  private ceoPlanningNativeStructuredSuccessTotal: Counter | null = null;
  private ceoLayerCallsTotal: Counter | null = null;
  private ceoClassificationConfidence: Histogram | null = null;
  private ceoFastpathHitTotal: Counter | null = null;
  private ceoFastpathConflictTotal: Counter | null = null;
  private ceoFastpathConflictRate: Gauge | null = null;
  private ceoPipelineLayerSeconds: Histogram | null = null;
  private collabConversationStateCacheTotal: Counter | null = null;
  private collabMoeMentionTotal: Counter | null = null;
  private collabClassifierHydrateMs: Histogram | null = null;
  private collabClassifierClassifyTotalMs: Histogram | null = null;
  private l2ReplyFactsCacheTotal: Counter | null = null;
  private l2ReplyFactsBuildLatencyMs: Histogram | null = null;
  private l2ReplyCacheTotal: Counter | null = null;
  private l2ReplyCacheHitRate: Gauge | null = null;
  private l1SemanticCacheTotal: Counter | null = null;
  private l1SemanticCacheHitRate: Gauge | null = null;
  private l2ReplyCacheTotalSeen = 0;
  private l2ReplyCacheHitSeen = 0;
  private l1SemanticCacheTotalSeen = 0;
  private l1SemanticCacheHitSeen = 0;
  private ceoOrchestrationContextRequestsTotal: Counter | null = null;
  private ceoLlmPrepCacheHitRatio: Gauge | null = null;
  private ceoLlmPrepCacheHitMs: Histogram | null = null;
  private ceoLlmPrepCacheMissMs: Histogram | null = null;
  private ceoInteractiveQueueLength: Gauge | null = null;
  private ceoInteractiveQueueLatencyMs: Histogram | null = null;
  private ceoInteractiveDlqCount: Counter | null = null;
  private ceoPlanRateLimitTotal: Counter | null = null;
  private ceoPlanFailfastTotal: Counter | null = null;
  /** Phase 3.5：foundry_ceo_early_exit_decision_total（labels: outcome=hit|miss） */
  private ceoEarlyExitDecisionTotal: Counter | null = null;
  private ceoHeavyQueuedTotal: Counter | null = null;
  private ceoHeavyProcessedTotal: Counter | null = null;
  private ceoHeavyAsyncJobDurationMs: Histogram | null = null;
  private ceoHeavyFallbackRate: Gauge | null = null;
  private ceoHeavyStageTimeoutTotal: Counter | null = null;
  private ceoHeavyPlannerLatencyMs: Histogram | null = null;
  private ceoHeavyPartialTasksCount: Histogram | null = null;
  private collabFallbackStageTotal: Counter | null = null;
  private collabRouteTransitionTotal: Counter | null = null;
  /** P2.2：foundry_collaboration_direct_agent_memory_inject_total（labels: type, status） */
  private collabDirectAgentMemoryInjectTotal: Counter | null = null;
  private ceoPreloadSuccessTotal: Counter | null = null;
  private ceoPreloadFailTotal: Counter | null = null;
  private ceoPreloadDurationMs: Histogram | null = null;
  private ceoPreloadSkipRate: Gauge | null = null;
  private llmKeyAcquireTotal: Counter | null = null;
  private llmKeyResolutionPolicyTotal: Counter | null = null;
  private experienceRecapGeneratedTotal: Counter | null = null;
  private experienceRecapGeneratedLatencyMs: Histogram | null = null;
  private experienceDynamicPoliciesAppliedTotal: Counter | null = null;
  private experienceFailurePatternFrequency: Gauge | null = null;
  private compensationRequestedTotal: Counter | null = null;
  private experienceRecapSkippedTotal: Counter | null = null;
  private experienceDynamicPolicyApplyLatencyMs: Histogram | null = null;
  private planningStructuredValidTotal: Counter | null = null;
  private planningRepairSuccessTotal: Counter | null = null;
  private planningFallbackTotal: Counter | null = null;
  private planningBlockedTotal: Counter | null = null;
  private planningValidationErrorCodeTotal: Counter | null = null;
  /** Contract channel: one structured invoke per attempt index + validity + coarse finish_reason bucket */
  private planningContractRoundTotal: Counter | null = null;
  private planningLatencyMs: Histogram | null = null;
  private planningStructuredSeen = 0;
  private planningStructuredValidSeen = 0;
  private planningStructuredValidRate: Gauge | null = null;
  private planningRepairSeen = 0;
  private planningRepairSuccessSeen = 0;
  private planningRepairSuccessRate: Gauge | null = null;
  private planningTotalSeen = 0;
  private planningFallbackSeen = 0;
  private planningFallbackRateGauge: Gauge | null = null;
  private planningBlockedSeen = 0;
  private planningBlockedRateGauge: Gauge | null = null;
  private ceoFastpathTotalSeen = 0;
  private ceoFastpathConflictSeen = 0;
  private ceoLlmPrepCacheTotalSeen = 0;
  private ceoLlmPrepCacheHitSeen = 0;
  private ceoPreloadSeen = 0;
  private ceoPreloadSkipped = 0;
  private ceoHeavyTotalSeen = 0;
  private ceoHeavyFallbackSeen = 0;
  private coordinationRedisFallbackTotal: Counter | null = null;
  private ceoGraphLockContentionTotal: Counter | null = null;
  private autonomousRunCycleTotal: Counter | null = null;
  private heartbeatTierTotal: Counter | null = null;

  onModuleInit() {
    const config = createMetricsConfigFromEnv();
    this.metricsManager = MetricsManager.create(config);
    this.taskRunOutcome = this.metricsManager.registerCounter({
      name: 'worker_task_run_outcome_total',
      help: 'CEO heartbeat task_runs completed or failed',
      labelNames: ['outcome', 'trigger_source'],
    });
    this.companyHeartbeatLifecycleTotal = this.metricsManager.registerCounter({
      name: 'company_heartbeat_lifecycle_total',
      help: 'Company runtime heartbeat lifecycle outcomes',
      labelNames: ['outcome', 'trigger_source'],
    });
    this.companySnapshotCapturedTotal = this.metricsManager.registerCounter({
      name: 'company_snapshot_captured_total',
      help: 'Company runtime snapshots captured',
      labelNames: [],
    });
    this.companyReportPublishedTotal = this.metricsManager.registerCounter({
      name: 'company_report_published_total',
      help: 'Company runtime heartbeat reports published',
      labelNames: [],
    });
    this.ceoHeartbeatDuration = this.metricsManager.registerHistogram({
      name: 'worker_ceo_heartbeat_cycle_seconds',
      help: 'CEO heartbeat run cycle wall time',
      labelNames: ['trigger_source'],
      buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    });
    this.directorFanoutOutcome = this.metricsManager.registerCounter({
      name: 'worker_ceo_heartbeat_director_fanout_total',
      help: 'Director fanout outcomes in heartbeat',
      labelNames: ['result'],
    });
    this.aggregationDuration = this.metricsManager.registerHistogram({
      name: 'worker_ceo_heartbeat_aggregation_seconds',
      help: 'Company heartbeat aggregation duration',
      labelNames: [],
      buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10, 20, 30],
    });
    this.heartbeatMemoryIngestOutcome = this.metricsManager.registerCounter({
      name: 'worker_ceo_heartbeat_memory_ingest_total',
      help: 'Memory ingest outcomes for heartbeat aggregation',
      labelNames: ['result'],
    });
    this.collaborationAutoJoinedOutcome = this.metricsManager.registerCounter({
      name: 'collaboration_auto_joined_total',
      help: 'Collaboration auto join outcomes by department',
      labelNames: ['status', 'department'],
    });
    this.collaborationAutoJoinedDuration = this.metricsManager.registerHistogram({
      name: 'collaboration_auto_joined_duration_seconds',
      help: 'Collaboration auto join latency by department',
      labelNames: ['department'],
      buckets: [0.01, 0.03, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    });
    this.collaborationReplyDuration = this.metricsManager.registerHistogram({
      name: 'collaboration_reply_latency_seconds',
      help: 'Collaboration reply latency by mode and success',
      labelNames: ['mode', 'success'],
      buckets: [0.1, 0.3, 0.5, 1, 2, 3, 5, 8, 13, 21, 34, 55],
    });
    this.collaborationReplyFirstTokenDuration = this.metricsManager.registerHistogram({
      name: 'collaboration_reply_first_token_seconds',
      help: 'Collaboration first token latency by mode and success',
      labelNames: ['mode', 'success'],
      buckets: [0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2, 3, 5, 8],
    });
    this.collaborationReplyChunkMergedCount = this.metricsManager.registerCounter({
      name: 'collaboration_reply_chunk_merged_count',
      help: 'Merged stream chunks emitted to frontend',
      labelNames: ['mode'],
    });
    this.collaborationReplyChunkOriginalCount = this.metricsManager.registerCounter({
      name: 'collaboration_reply_chunk_original_count',
      help: 'Original model chunks before merge',
      labelNames: ['mode'],
    });
    this.approvalRequiredTotal = this.metricsManager.registerCounter({
      name: 'approval_required_total',
      help: 'Supervisor approvals requested by action type',
      labelNames: ['type'],
    });
    this.approvalOutcomeTotal = this.metricsManager.registerCounter({
      name: 'approval_outcome_total',
      help: 'Approval outcomes',
      labelNames: ['outcome'],
    });
    this.approvalLatency = this.metricsManager.registerHistogram({
      name: 'approval_latency_seconds',
      help: 'Time from approval request to terminal outcome',
      labelNames: [],
      buckets: [1, 2, 5, 10, 20, 30, 60, 120, 300, 600, 1200],
    });
    this.taskExecutionResumedAfterApprovalTotal = this.metricsManager.registerCounter({
      name: 'task_execution_resumed_after_approval_total',
      help: 'Task execution resumed after approval',
      labelNames: ['company_id', 'approved'],
    });
    this.taskExecutionBlockedByApprovalTotal = this.metricsManager.registerCounter({
      name: 'task_execution_blocked_by_approval_total',
      help: 'Task execution blocked by approval decision',
      labelNames: ['reason'],
    });
    this.supervisorReviewTotal = this.metricsManager.registerCounter({
      name: 'supervisor_review_total',
      help: 'Supervisor post reviews by outcome',
      labelNames: ['outcome'],
    });
    this.supervisorReviewLatency = this.metricsManager.registerHistogram({
      name: 'supervisor_review_latency_seconds',
      help: 'Supervisor post review latency',
      labelNames: [],
      buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 3, 5, 8, 13],
    });
    this.supervisorFindingsTotal = this.metricsManager.registerCounter({
      name: 'supervisor_findings_total',
      help: 'Supervisor findings by severity',
      labelNames: ['severity'],
    });
    this.supervisorReviewQualityScore = this.metricsManager.registerHistogram({
      name: 'supervisor_review_quality_score_avg',
      help: 'Supervisor post review quality score distribution (0-100)',
      labelNames: [],
      buckets: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    });
    this.parallelDiscussionTotal = this.metricsManager.registerCounter({
      name: 'parallel_discussion_total',
      help: 'Parallel discussion runs by outcome',
      labelNames: ['outcome'],
    });
    this.parallelAgentCount = this.metricsManager.registerHistogram({
      name: 'parallel_agent_count',
      help: 'Agent count per parallel discussion',
      labelNames: [],
      buckets: [1, 2, 3, 4, 5, 6],
    });
    this.discussionMergeLatencySeconds = this.metricsManager.registerHistogram({
      name: 'discussion_merge_latency_seconds',
      help: 'Elapsed seconds to finish parallel discussion merge',
      labelNames: [],
      buckets: [0.2, 0.5, 1, 2, 3, 5, 8, 13, 21, 34, 55],
    });
    this.structuredOutputParseFailures = this.metricsManager.registerCounter({
      name: 'structured_output_parse_failures_total',
      help: 'Structured output parse failures by pipeline and node',
      labelNames: ['pipeline', 'node'],
    });
    this.l2StructuredOutputTotal = this.metricsManager.registerCounter({
      name: 'foundry_l2_structured_output_total',
      help: 'foundry.l2.structured_output outcomes',
      labelNames: ['has_tasks', 'has_approval', 'escalate_to_l3'],
    });
    this.memoryPermissionDeniedTotal = this.metricsManager.registerCounter({
      name: 'memory_permission_denied_total',
      help: 'Memory permission denied events by stage',
      labelNames: ['stage'],
    });
    this.memoryFallbackToCompanyTotal = this.metricsManager.registerCounter({
      name: 'memory_fallback_to_company_namespace_total',
      help: 'Memory writes that fallback to company namespace',
      labelNames: ['stage'],
    });
    this.ceoHeartbeatPlanningFallbackTotal = this.metricsManager.registerCounter({
      name: 'ceo_heartbeat_planning_fallback_total',
      help: 'CEO heartbeat planning fallback count',
      labelNames: [],
    });
    this.ceoPlanningRepairAttemptsTotal = this.metricsManager.registerCounter({
      name: 'ceo_planning_repair_attempts_total',
      help: 'CEO planning structured output repair attempts',
      labelNames: ['stage'],
    });
    this.ceoPlanningNativeStructuredSuccessTotal = this.metricsManager.registerCounter({
      name: 'ceo_planning_native_structured_success_total',
      help: 'CEO planning native structured output successful parses',
      labelNames: ['stage'],
    });
    this.ceoLayerCallsTotal = this.metricsManager.registerCounter({
      name: 'ceo_layer_calls_total',
      help: 'CEO layer entry calls by layer and status',
      labelNames: ['layer', 'status'],
    });
    this.ceoClassificationConfidence = this.metricsManager.registerHistogram({
      name: 'ceo_classification_confidence',
      help: 'CEO classifier confidence distribution',
      labelNames: [],
      buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
    });
    this.ceoFastpathHitTotal = this.metricsManager.registerCounter({
      name: 'ceo_fastpath_hit_total',
      help: 'CEO fastpath outcomes by action',
      labelNames: ['action'],
    });
    this.ceoFastpathConflictTotal = this.metricsManager.registerCounter({
      name: 'ceo_fastpath_conflict_total',
      help: 'CEO fastpath conflicts detected by resolver',
      labelNames: ['action'],
    });
    this.ceoFastpathConflictRate = this.metricsManager.registerGauge({
      name: 'ceo_fastpath_conflict_rate',
      help: 'CEO fastpath conflict rate (conflict / total) in-process',
      labelNames: [],
    });
    this.ceoPipelineLayerSeconds = this.metricsManager.registerHistogram({
      name: 'ceo_pipeline_layer_seconds',
      help: 'CEO pipeline layer latency',
      labelNames: ['layer'],
      buckets: [0.01, 0.03, 0.05, 0.1, 0.2, 0.35, 0.5, 0.8, 1.2, 2, 3, 5, 8, 13, 21],
    });
    this.collabConversationStateCacheTotal = this.metricsManager.registerCounter({
      name: 'collab_conversation_state_cache_total',
      help: 'Conversation state cache (Redis) for GroupChatContext — P10 / Sprint2 observability',
      labelNames: ['result'],
    });
    this.collabMoeMentionTotal = this.metricsManager.registerCounter({
      name: 'collab_mention_moe_router_total',
      help: 'L1 MoE mention-intent router outcomes (draft / confirmed / idle / shortcircuit)',
      labelNames: ['route', 'path'],
    });
    this.collabClassifierHydrateMs = this.metricsManager.registerHistogram({
      name: 'collab_classifier_hydrate_ms',
      help: 'L1 conversation_state hydrate wall (Redis → Memory); P10 join with collab_classifier_classify_total_ms',
      labelNames: ['source'],
      buckets: [1, 2, 4, 8, 15, 25, 40, 55, 60, 85, 120, 200, 400, 800],
    });
    this.collabClassifierClassifyTotalMs = this.metricsManager.registerHistogram({
      name: 'collab_classifier_classify_total_ms',
      help: 'L1 classify wall time; path=idle_moe | llm (P10 CEO Layer Breakdown P99)',
      labelNames: ['path'],
      buckets: [4, 8, 15, 25, 40, 55, 70, 85, 100, 120, 160, 220, 400, 800, 2000],
    });
    this.l2ReplyFactsCacheTotal = this.metricsManager.registerCounter({
      name: 'foundry_l2_replyfacts_cache_total',
      help: 'foundry.l2.replyfacts.cache.hit/miss',
      labelNames: ['result'],
    });
    this.l2ReplyFactsBuildLatencyMs = this.metricsManager.registerHistogram({
      name: 'foundry_l2_replyfacts_build_latency_ms',
      help: 'foundry.l2.replyfacts.build.latency_ms',
      labelNames: [],
      buckets: [1, 2, 5, 10, 20, 35, 50, 80, 120, 200, 350, 500, 800, 1200, 2000, 5000],
    });
    this.l2ReplyCacheTotal = this.metricsManager.registerCounter({
      name: 'foundry_l2_reply_cache_total',
      help: 'foundry.l2.reply.cache.hit/miss',
      labelNames: ['result'],
    });
    this.l2ReplyCacheHitRate = this.metricsManager.registerGauge({
      name: 'foundry_l2_reply_cache_hit_rate',
      help: 'foundry.l2.reply.cache.hit_rate in-process (hit/total)',
      labelNames: [],
    });
    this.l1SemanticCacheTotal = this.metricsManager.registerCounter({
      name: 'foundry_l1_cache_semantic_total',
      help: 'foundry.l1.cache.semantic hit/miss',
      labelNames: ['result'],
    });
    this.l1SemanticCacheHitRate = this.metricsManager.registerGauge({
      name: 'foundry_l1_cache_hit_rate',
      help: 'foundry.l1.cache.hit_rate in-process (hit/total)',
      labelNames: [],
    });
    this.ceoOrchestrationContextRequestsTotal = this.metricsManager.registerCounter({
      name: 'ceo_orchestration_context_total',
      help: 'CEO orchestration context cache requests',
      labelNames: ['result'],
    });
    this.ceoLlmPrepCacheHitRatio = this.metricsManager.registerGauge({
      name: 'ceo_llm_prep_cache_hit_ratio',
      help: 'CEO llm_prep cache hit ratio in-process',
      labelNames: [],
    });
    this.ceoLlmPrepCacheHitMs = this.metricsManager.registerHistogram({
      name: 'ceo_llm_prep_cache_hit_ms',
      help: 'CEO llm_prep cache hit latency in milliseconds',
      labelNames: [],
      buckets: [1, 2, 5, 10, 20, 35, 50, 80, 120, 200, 300, 500],
    });
    this.ceoLlmPrepCacheMissMs = this.metricsManager.registerHistogram({
      name: 'ceo_llm_prep_cache_miss_ms',
      help: 'CEO llm_prep cache miss lookup latency in milliseconds',
      labelNames: [],
      buckets: [1, 2, 5, 10, 20, 35, 50, 80, 120, 200, 300, 500, 800, 1200],
    });
    this.ceoInteractiveQueueLength = this.metricsManager.registerGauge({
      name: 'ceo_interactive_queue_length',
      help: 'CEO interactive queue in-flight request count in worker',
      labelNames: [],
    });
    this.ceoInteractiveQueueLatencyMs = this.metricsManager.registerHistogram({
      name: 'ceo_interactive_queue_latency_ms',
      help: 'CEO interactive queue RPC latency in milliseconds',
      labelNames: ['result'],
      buckets: [1, 2, 5, 10, 20, 35, 50, 80, 120, 200, 300, 500, 800, 1200, 2000, 5000, 8000],
    });
    this.ceoInteractiveDlqCount = this.metricsManager.registerCounter({
      name: 'ceo_interactive_dlq_count',
      help: 'CEO interactive queue send failures (proxy for DLQ risk)',
      labelNames: [],
    });
    this.ceoPlanRateLimitTotal = this.metricsManager.registerCounter({
      name: 'ceo_plan_rate_limit_total',
      help: 'Autonomous CEO plan rate-limit signals',
      labelNames: ['stage'],
    });
    this.ceoPlanFailfastTotal = this.metricsManager.registerCounter({
      name: 'ceo_plan_failfast_total',
      help: 'Autonomous CEO plan failfast outcomes',
      labelNames: ['reason'],
    });
    this.ceoEarlyExitDecisionTotal = this.metricsManager.registerCounter({
      name: 'foundry_ceo_early_exit_decision_total',
      help: 'CEO autonomous graph early-exit arbitration outcomes (Phase 3.5)',
      labelNames: ['outcome'],
    });
    this.ceoHeavyQueuedTotal = this.metricsManager.registerCounter({
      name: 'ceo_heavy_queued_total',
      help: 'CEO heavy async queued jobs',
      labelNames: [],
    });
    this.ceoHeavyProcessedTotal = this.metricsManager.registerCounter({
      name: 'ceo_heavy_processed_total',
      help: 'CEO heavy async processed jobs',
      labelNames: ['result'],
    });
    this.ceoHeavyAsyncJobDurationMs = this.metricsManager.registerHistogram({
      name: 'ceo_heavy_async_job_duration_ms',
      help: 'CEO heavy async job processing duration in milliseconds',
      labelNames: [],
      buckets: [10, 25, 50, 100, 200, 400, 800, 1200, 2000, 5000, 10000, 20000, 45000],
    });
    this.ceoHeavyFallbackRate = this.metricsManager.registerGauge({
      name: 'ceo_heavy_fallback_rate',
      help: 'CEO heavy fallback ratio in-process',
      labelNames: [],
    });
    this.ceoHeavyStageTimeoutTotal = this.metricsManager.registerCounter({
      name: 'ceo_heavy_stage_timeout',
      help: 'CEO heavy stage timeout count',
      labelNames: ['stage'],
    });
    this.ceoHeavyPlannerLatencyMs = this.metricsManager.registerHistogram({
      name: 'ceo_heavy_planner_latency_ms',
      help: 'CEO heavy planner latency in milliseconds',
      labelNames: ['stage'],
      buckets: [50, 100, 200, 350, 500, 800, 1200, 2000, 4000, 8000, 16000, 32000, 64000, 120000],
    });
    this.ceoHeavyPartialTasksCount = this.metricsManager.registerHistogram({
      name: 'ceo_heavy_partial_tasks_count',
      help: 'CEO heavy partial tasks count observed during splitting',
      labelNames: ['stage'],
      buckets: [0, 1, 2, 3, 5, 8, 13, 21, 34],
    });
    this.collabFallbackStageTotal = this.metricsManager.registerCounter({
      name: 'collab_fallback_stage_total',
      help: 'Collaboration fallback stage transitions',
      labelNames: ['stage', 'reason'],
    });
    this.collabRouteTransitionTotal = this.metricsManager.registerCounter({
      name: 'collab_route_transition_total',
      help: 'Collaboration route transitions across layers',
      labelNames: ['from', 'to', 'source'],
    });
    this.collabDirectAgentMemoryInjectTotal = this.metricsManager.registerCounter({
      name: 'foundry_collaboration_direct_agent_memory_inject_total',
      help:
        'P2.2 主群召唤 Agent 记忆注入：type=company_profile|transcript|failed，status=hit|miss|failed（与 OTel foundry.collaboration.direct_agent.memory_inject 对齐）',
      labelNames: ['type', 'status'],
    });
    this.ceoPreloadSuccessTotal = this.metricsManager.registerCounter({
      name: 'ceo_preload_success_total',
      help: 'CEO preload successful runs',
      labelNames: [],
    });
    this.ceoPreloadFailTotal = this.metricsManager.registerCounter({
      name: 'ceo_preload_fail_total',
      help: 'CEO preload failed runs',
      labelNames: ['room_id'],
    });
    this.ceoPreloadDurationMs = this.metricsManager.registerHistogram({
      name: 'ceo_preload_duration_ms',
      help: 'CEO preload duration in milliseconds',
      labelNames: [],
      buckets: [5, 10, 20, 35, 50, 80, 120, 200, 300, 500, 800, 1200, 2000, 5000],
    });
    this.ceoPreloadSkipRate = this.metricsManager.registerGauge({
      name: 'ceo_preload_skip_rate',
      help: 'CEO preload skip ratio in-process',
      labelNames: [],
    });

    this.llmKeyAcquireTotal = this.metricsManager.registerCounter({
      name: 'llm_key_acquire_total',
      help: 'Worker LLM key acquire outcomes (symmetric to API embedding_pool_acquire_total)',
      labelNames: ['outcome'],
    });
    this.llmKeyResolutionPolicyTotal = this.metricsManager.registerCounter({
      name: 'llm_key_resolution_policy_total',
      help: 'Collaboration LLM key resolution policy_id (no secrets)',
      labelNames: ['policy_id'],
    });

    this.experienceRecapGeneratedTotal = this.metricsManager.registerCounter({
      name: 'experience_recap_generated_total',
      help: 'Structured recaps generated from discussion converged events',
      labelNames: ['outcome'],
    });
    this.experienceRecapGeneratedLatencyMs = this.metricsManager.registerHistogram({
      name: 'experience_recap_generated_latency_ms',
      help: 'End-to-end recap generation wall time in milliseconds',
      labelNames: ['outcome'],
      buckets: [50, 100, 200, 350, 500, 800, 1200, 2000, 5000, 8000, 12000],
    });
    this.experienceDynamicPoliciesAppliedTotal = this.metricsManager.registerCounter({
      name: 'experience_dynamic_policies_applied_total',
      help: 'Dynamic policy suggestions applied from recaps',
      labelNames: [],
    });
    this.experienceFailurePatternFrequency = this.metricsManager.registerGauge({
      name: 'experience_failure_pattern_frequency',
      help: 'Latest recap errorPattern frequency by category (best-effort signal)',
      labelNames: ['category'],
    });
    this.compensationRequestedTotal = this.metricsManager.registerCounter({
      name: 'compensation_requested_total',
      help: 'Compensation events requested',
      labelNames: [],
    });
    this.experienceRecapSkippedTotal = this.metricsManager.registerCounter({
      name: 'experience_recap_skipped_total',
      help: 'Recap generation skipped due to resilience controls',
      labelNames: ['reason'],
    });
    this.experienceDynamicPolicyApplyLatencyMs = this.metricsManager.registerHistogram({
      name: 'experience_dynamic_policy_apply_latency_ms',
      help: 'Latency to apply dynamic policies from recap event in worker',
      labelNames: ['result'],
      buckets: [5, 10, 20, 35, 50, 80, 120, 200, 350, 500, 800, 1200, 2000],
    });
    this.planningStructuredValidTotal = this.metricsManager.registerCounter({
      name: 'planning_structured_valid_total',
      help: 'Planning structured validation outcomes by pipeline stage',
      labelNames: ['result', 'mode'],
    });
    this.planningRepairSuccessTotal = this.metricsManager.registerCounter({
      name: 'planning_repair_success_total',
      help: 'Planning repair outcomes',
      labelNames: ['result'],
    });
    this.planningFallbackTotal = this.metricsManager.registerCounter({
      name: 'planning_fallback_total',
      help: 'Planning fallback count by reason',
      labelNames: ['reason'],
    });
    this.planningBlockedTotal = this.metricsManager.registerCounter({
      name: 'planning_blocked_total',
      help: 'Planning blocked count by reason',
      labelNames: ['reason'],
    });
    this.planningValidationErrorCodeTotal = this.metricsManager.registerCounter({
      name: 'planning_validation_error_code_total',
      help: 'Planning validation errors by reason code',
      labelNames: ['code'],
    });
    this.planningContractRoundTotal = this.metricsManager.registerCounter({
      name: 'planning_contract_round_total',
      help: 'CEO v2 strategy contract channel structured invokes',
      labelNames: ['attempt', 'valid', 'finish_reason_bucket'],
    });
    this.planningLatencyMs = this.metricsManager.registerHistogram({
      name: 'planning_latency_ms',
      help: 'Planning latency in milliseconds by stage',
      labelNames: ['stage'],
      buckets: [50, 100, 200, 350, 500, 800, 1200, 2000, 4000, 8000, 12000, 20000, 30000, 45000, 60000],
    });
    this.planningStructuredValidRate = this.metricsManager.registerGauge({
      name: 'planning_structured_valid_rate',
      help: 'Planning structured valid ratio in-process',
      labelNames: [],
    });
    this.planningRepairSuccessRate = this.metricsManager.registerGauge({
      name: 'planning_repair_success_rate',
      help: 'Planning repair success ratio in-process',
      labelNames: [],
    });
    this.planningFallbackRateGauge = this.metricsManager.registerGauge({
      name: 'planning_fallback_rate',
      help: 'Planning fallback ratio in-process',
      labelNames: [],
    });
    this.planningBlockedRateGauge = this.metricsManager.registerGauge({
      name: 'planning_blocked_rate',
      help: 'Planning blocked ratio in-process',
      labelNames: [],
    });
    this.coordinationRedisFallbackTotal = this.metricsManager.registerCounter({
      name: 'foundry_coordination_redis_fallback_total',
      help: 'Company execution coordination fell back to in-process state',
      labelNames: ['reason'],
    });
    this.ceoGraphLockContentionTotal = this.metricsManager.registerCounter({
      name: 'foundry_ceo_graph_lock_contention_total',
      help: 'CEO LangGraph lock not acquired due to contention',
      labelNames: [],
    });
    this.autonomousRunCycleTotal = this.metricsManager.registerCounter({
      name: 'foundry_autonomous_run_cycle_total',
      help: 'Autonomous run coordinator cycle outcomes',
      labelNames: ['outcome', 'trigger_source'],
    });
    this.heartbeatTierTotal = this.metricsManager.registerCounter({
      name: 'foundry_heartbeat_tier_total',
      help: 'CEO heartbeat tier decisions (cheap skips LangGraph; full runs CEO graph)',
      labelNames: ['tier', 'reason'],
    });
  }

  recordTaskRunOutcome(outcome: 'success' | 'failed', triggerSource: string): void {
    this.taskRunOutcome?.inc({ outcome, trigger_source: triggerSource });
  }

  incCompanyHeartbeatLifecycle(
    outcome: 'completed' | 'failed',
    triggerSource: string,
  ): void {
    this.companyHeartbeatLifecycleTotal?.inc({ outcome, trigger_source: triggerSource });
  }

  incCompanySnapshotCaptured(): void {
    this.companySnapshotCapturedTotal?.inc({});
  }

  incCompanyReportPublished(): void {
    this.companyReportPublishedTotal?.inc({});
  }

  observeCeoHeartbeatSeconds(triggerSource: string, seconds: number): void {
    this.ceoHeartbeatDuration?.observe({ trigger_source: triggerSource }, seconds);
  }

  recordDirectorFanoutOutcome(result: 'success' | 'failed'): void {
    this.directorFanoutOutcome?.inc({ result });
  }

  observeAggregationSeconds(seconds: number): void {
    this.aggregationDuration?.observe({}, seconds);
  }

  recordHeartbeatMemoryIngestOutcome(result: 'success' | 'failed'): void {
    this.heartbeatMemoryIngestOutcome?.inc({ result });
  }

  recordHeartbeatTier(tier: 'cheap' | 'full', reason: string): void {
    const bucket = String(reason ?? 'unknown')
      .trim()
      .slice(0, 64)
      .replace(/[^a-z0-9_]/gi, '_')
      .toLowerCase();
    this.heartbeatTierTotal?.inc({ tier, reason: bucket || 'unknown' });
  }

  recordCollaborationAutoJoinedOutcome(status: 'success' | 'fail', department: string): void {
    this.collaborationAutoJoinedOutcome?.inc({ status, department });
  }

  observeCollaborationAutoJoinedSeconds(department: string, seconds: number): void {
    this.collaborationAutoJoinedDuration?.observe({ department }, seconds);
  }

  observeCollaborationReplySeconds(
    mode: 'quick' | 'structured',
    success: 'true' | 'false',
    seconds: number,
  ): void {
    this.collaborationReplyDuration?.observe({ mode, success }, seconds);
  }

  observeCollaborationReplyFirstTokenSeconds(
    mode: 'quick' | 'structured',
    success: 'true' | 'false',
    seconds: number,
  ): void {
    this.collaborationReplyFirstTokenDuration?.observe({ mode, success }, seconds);
  }

  incCollaborationReplyChunkMerged(mode: 'quick' | 'structured', by = 1): void {
    this.collaborationReplyChunkMergedCount?.inc({ mode }, by);
  }

  incCollaborationReplyChunkOriginal(mode: 'quick' | 'structured', by = 1): void {
    this.collaborationReplyChunkOriginalCount?.inc({ mode }, by);
  }

  incApprovalRequired(type: string): void {
    this.approvalRequiredTotal?.inc({ type });
  }

  incApprovalOutcome(outcome: 'approved' | 'rejected' | 'expired' | 'pending' | 'cancelled'): void {
    this.approvalOutcomeTotal?.inc({ outcome });
  }

  observeApprovalLatency(seconds: number): void {
    this.approvalLatency?.observe({}, seconds);
  }

  incTaskExecutionResumedAfterApproval(companyId: string): void {
    this.taskExecutionResumedAfterApprovalTotal?.inc({ company_id: companyId, approved: 'true' });
  }

  incTaskExecutionBlockedByApproval(reason: string): void {
    this.taskExecutionBlockedByApprovalTotal?.inc({ reason: reason || 'unknown' });
  }

  incSupervisorReview(outcome: 'success' | 'failed' | 'skipped'): void {
    this.supervisorReviewTotal?.inc({ outcome });
  }

  observeSupervisorReviewLatency(seconds: number): void {
    this.supervisorReviewLatency?.observe({}, seconds);
  }

  incSupervisorFindings(severity: 'low' | 'medium' | 'high' | 'critical', by = 1): void {
    this.supervisorFindingsTotal?.inc({ severity }, by);
  }

  observeSupervisorReviewQualityScore(score: number): void {
    this.supervisorReviewQualityScore?.observe({}, Math.max(0, Math.min(100, score)));
  }

  incParallelDiscussionTotal(outcome: 'completed' | 'partial_failed' | 'intent_rejected' | 'token_missing'): void {
    this.parallelDiscussionTotal?.inc({ outcome });
  }

  observeParallelAgentCount(count: number): void {
    this.parallelAgentCount?.observe({}, Math.max(0, count));
  }

  observeDiscussionMergeLatencySeconds(seconds: number): void {
    this.discussionMergeLatencySeconds?.observe({}, Math.max(0, seconds));
  }

  incStructuredOutputParseFailure(pipeline: 'ceo_heartbeat' | 'supervisor', node: string): void {
    this.structuredOutputParseFailures?.inc({ pipeline, node });
  }

  recordL2StructuredOutput(params: {
    hasSuggestedTasks: boolean;
    hasApprovalPreview: boolean;
    escalateToL3: boolean;
  }): void {
    this.l2StructuredOutputTotal?.inc({
      has_tasks: params.hasSuggestedTasks ? 'true' : 'false',
      has_approval: params.hasApprovalPreview ? 'true' : 'false',
      escalate_to_l3: params.escalateToL3 ? 'true' : 'false',
    });
  }

  incMemoryPermissionDenied(stage: string): void {
    this.memoryPermissionDeniedTotal?.inc({ stage });
  }

  incMemoryFallbackToCompany(stage: string): void {
    this.memoryFallbackToCompanyTotal?.inc({ stage });
  }

  incCeoPlanningFallback(): void {
    this.ceoHeartbeatPlanningFallbackTotal?.inc({});
  }

  incCeoPlanningRepairAttempt(stage: 'intent' | 'tasks'): void {
    this.ceoPlanningRepairAttemptsTotal?.inc({ stage });
  }

  incCeoPlanningNativeStructuredSuccess(stage: 'intent' | 'tasks'): void {
    this.ceoPlanningNativeStructuredSuccessTotal?.inc({ stage });
  }

  incCeoLayerCall(layer: 'classifier' | 'light' | 'heavy', status: 'success' | 'fallback' | 'failed'): void {
    this.ceoLayerCallsTotal?.inc({ layer, status });
  }

  observeCeoClassificationConfidence(score: number): void {
    this.ceoClassificationConfidence?.observe({}, Math.max(0, Math.min(1, score)));
  }

  incCeoFastpathHit(action: 'direct' | 'merged' | 'fallback' | 'miss'): void {
    this.ceoFastpathHitTotal?.inc({ action });
    this.ceoFastpathTotalSeen += 1;
    this.updateFastpathConflictRate();
  }

  incCeoFastpathConflict(action: 'merged' | 'fallback'): void {
    this.ceoFastpathConflictTotal?.inc({ action });
    this.ceoFastpathConflictSeen += 1;
    this.updateFastpathConflictRate();
  }

  private updateFastpathConflictRate(): void {
    if (!this.ceoFastpathConflictRate) return;
    const denom = this.ceoFastpathTotalSeen;
    const rate = denom > 0 ? this.ceoFastpathConflictSeen / denom : 0;
    this.ceoFastpathConflictRate.set({}, Math.max(0, Math.min(1, rate)));
  }

  observeCeoPipelineLayerSeconds(
    layer:
      | 'ingest'
      | 'fastpath'
      | 'classify'
      | 'llm_prep'
      | 'llm_invoke'
      | 'append'
      | 'total'
      | 'context_cache',
    seconds: number,
  ): void {
    this.ceoPipelineLayerSeconds?.observe({ layer }, Math.max(0, seconds));
  }

  /** P10：conversation_state Redis 命中 / 未命中 / 写入 */
  incCollabConversationStateCache(result: 'redis_hit' | 'redis_miss' | 'redis_write'): void {
    this.collabConversationStateCacheTotal?.inc({ result });
  }

  /**
   * P2.2：主群召唤 Agent 时 auxiliary 记忆注入（company_profile / transcript 各一条 outcome）。
   * `type=failed` 仅用于无法归入画像或 transcript 的失败聚合（尽量少用）。
   */
  incCollaborationDirectAgentMemoryInject(labels: {
    type: 'company_profile' | 'transcript' | 'failed';
    status: 'hit' | 'miss' | 'failed';
  }): void {
    this.collabDirectAgentMemoryInjectTotal?.inc(labels);
  }

  /** P10：L1 MoE @ 路由（可与 ceo-layers 仪表盘 join） */
  incCollabMoeMentionRoute(route: 'draft' | 'confirmed' | 'idle' | 'idle_shortcircuit', path: 'local' | 'mcp_fallback'): void {
    this.collabMoeMentionTotal?.inc({ route, path });
  }

  observeCollabClassifierHydrateMs(source: 'redis' | 'memory' | 'combined', ms: number): void {
    this.collabClassifierHydrateMs?.observe({ source }, Math.max(0, ms));
  }

  /** P10：L1 classify_total_ms；path 仅 idle_moe | llm */
  observeCollabClassifierClassifyTotalMs(path: 'idle_moe' | 'llm', ms: number): void {
    this.collabClassifierClassifyTotalMs?.observe({ path }, Math.max(0, ms));
  }

  recordL2ReplyFactsCache(result: 'hit' | 'miss'): void {
    this.l2ReplyFactsCacheTotal?.inc({ result });
  }

  observeL2ReplyFactsBuildLatencyMs(ms: number): void {
    this.l2ReplyFactsBuildLatencyMs?.observe({}, Math.max(0, ms));
  }

  recordL2ReplyCacheLookup(result: 'hit' | 'miss'): void {
    this.l2ReplyCacheTotal?.inc({ result });
    this.l2ReplyCacheTotalSeen += 1;
    if (result === 'hit') this.l2ReplyCacheHitSeen += 1;
    const denom = this.l2ReplyCacheTotalSeen;
    const rate = denom > 0 ? this.l2ReplyCacheHitSeen / denom : 0;
    this.l2ReplyCacheHitRate?.set({}, Math.max(0, Math.min(1, rate)));
  }

  recordL1SemanticCacheLookup(result: 'hit' | 'miss'): void {
    this.l1SemanticCacheTotal?.inc({ result });
    this.l1SemanticCacheTotalSeen += 1;
    if (result === 'hit') this.l1SemanticCacheHitSeen += 1;
    const denom = this.l1SemanticCacheTotalSeen;
    const rate = denom > 0 ? this.l1SemanticCacheHitSeen / denom : 0;
    this.l1SemanticCacheHitRate?.set({}, Math.max(0, Math.min(1, rate)));
  }

  incCeoOrchestrationContext(result: 'hit' | 'miss' | 'error'): void {
    this.ceoOrchestrationContextRequestsTotal?.inc({ result });
  }

  recordCeoLlmPrepCacheLookup(result: 'hit' | 'miss', elapsedMs: number): void {
    if (result === 'hit') {
      this.ceoLlmPrepCacheHitSeen += 1;
      this.ceoLlmPrepCacheHitMs?.observe({}, Math.max(0, elapsedMs));
    } else {
      this.ceoLlmPrepCacheMissMs?.observe({}, Math.max(0, elapsedMs));
    }
    this.ceoLlmPrepCacheTotalSeen += 1;
    const denom = this.ceoLlmPrepCacheTotalSeen;
    const ratio = denom > 0 ? this.ceoLlmPrepCacheHitSeen / denom : 0;
    this.ceoLlmPrepCacheHitRatio?.set({}, Math.max(0, Math.min(1, ratio)));
  }

  setCeoInteractiveQueueLength(length: number): void {
    this.ceoInteractiveQueueLength?.set({}, Math.max(0, length));
  }

  observeCeoInteractiveQueueLatencyMs(result: 'success' | 'error', elapsedMs: number): void {
    this.ceoInteractiveQueueLatencyMs?.observe({ result }, Math.max(0, elapsedMs));
  }

  incCeoInteractiveDlqCount(by = 1): void {
    this.ceoInteractiveDlqCount?.inc({}, by);
  }

  incCeoPlanRateLimit(stage: 'llm_call' | 'cooldown_block' | 'soft_failure'): void {
    this.ceoPlanRateLimitTotal?.inc({ stage });
  }

  incCeoPlanFailfast(reason: 'rate_limit_cooldown' | 'admission_blocked' | 'single_flight_shared'): void {
    this.ceoPlanFailfastTotal?.inc({ reason });
  }

  /** Phase 3.5：Early-Exit 命中 / 未命中计数（与日志 `foundry.ceo.early_exit.decision` 对齐观测） */
  recordCeoEarlyExitDecision(outcome: 'hit' | 'miss', by = 1): void {
    const n = Number.isFinite(by) ? Math.max(0, Math.floor(by)) : 0;
    if (n <= 0) return;
    this.ceoEarlyExitDecisionTotal?.inc({ outcome }, n);
  }

  incCeoHeavyQueuedTotal(by = 1): void {
    this.ceoHeavyQueuedTotal?.inc({}, by);
  }

  incCeoHeavyProcessedTotal(result: 'success' | 'error', by = 1): void {
    this.ceoHeavyProcessedTotal?.inc({ result }, by);
  }

  observeCeoHeavyAsyncJobDurationMs(elapsedMs: number): void {
    this.ceoHeavyAsyncJobDurationMs?.observe({}, Math.max(0, elapsedMs));
  }

  incCeoHeavyFallback(by = 1): void {
    const v = Number.isFinite(by) ? Math.max(0, by) : 0;
    this.ceoHeavyFallbackSeen += v;
    this.ceoHeavyTotalSeen += v;
    this.updateCeoHeavyFallbackRate();
  }

  incCeoHeavyTotal(by = 1): void {
    const v = Number.isFinite(by) ? Math.max(0, by) : 0;
    this.ceoHeavyTotalSeen += v;
    this.updateCeoHeavyFallbackRate();
  }

  private updateCeoHeavyFallbackRate(): void {
    const denom = this.ceoHeavyTotalSeen;
    const ratio = denom > 0 ? this.ceoHeavyFallbackSeen / denom : 0;
    this.ceoHeavyFallbackRate?.set({}, Math.max(0, Math.min(1, ratio)));
  }

  incCeoHeavyStageTimeout(stage: string, by = 1): void {
    this.ceoHeavyStageTimeoutTotal?.inc({ stage: stage || 'unknown' }, by);
  }

  observeCeoHeavyPlannerLatencyMs(stage: string, elapsedMs: number): void {
    this.ceoHeavyPlannerLatencyMs?.observe({ stage: stage || 'unknown' }, Math.max(0, elapsedMs));
  }

  observeCeoHeavyPartialTasksCount(stage: string, tasksCount: number): void {
    this.ceoHeavyPartialTasksCount?.observe(
      { stage: stage || 'unknown' },
      Math.max(0, Number.isFinite(tasksCount) ? tasksCount : 0),
    );
  }

  incCollabFallbackStage(stage: string, reason: string): void {
    this.collabFallbackStageTotal?.inc({ stage: stage || 'unknown', reason: reason || 'unknown' });
  }

  incCollabRouteTransition(from: string, to: string, source: string): void {
    this.collabRouteTransitionTotal?.inc({
      from: from || 'unknown',
      to: to || 'unknown',
      source: source || 'unknown',
    });
  }

  incCeoPreloadSuccess(): void {
    this.ceoPreloadSeen += 1;
    this.ceoPreloadSuccessTotal?.inc({});
    this.updateCeoPreloadSkipRate();
  }

  incCeoPreloadFail(roomId?: string): void {
    this.ceoPreloadSeen += 1;
    this.ceoPreloadFailTotal?.inc({ room_id: roomId || 'unknown' });
    this.updateCeoPreloadSkipRate();
  }

  incCeoPreloadSkip(): void {
    this.ceoPreloadSeen += 1;
    this.ceoPreloadSkipped += 1;
    this.updateCeoPreloadSkipRate();
  }

  observeCeoPreloadDurationMs(elapsedMs: number): void {
    this.ceoPreloadDurationMs?.observe({}, Math.max(0, elapsedMs));
  }

  recordExperienceRecapGenerated(
    outcome: 'success' | 'partial_success' | 'failure' | 'timeout',
    elapsedMs: number,
  ): void {
    this.experienceRecapGeneratedTotal?.inc({ outcome });
    this.experienceRecapGeneratedLatencyMs?.observe({ outcome }, Math.max(0, elapsedMs));
  }

  recordExperienceDynamicPoliciesApplied(applied: number): void {
    const by = Number.isFinite(applied) ? Math.max(0, applied) : 0;
    if (by > 0) this.experienceDynamicPoliciesAppliedTotal?.inc({}, by);
  }

  setExperienceFailurePatternFrequency(category: string, frequency: number): void {
    const c = (category || 'other').trim() || 'other';
    const f = Number.isFinite(frequency) ? Math.max(0, frequency) : 0;
    this.experienceFailurePatternFrequency?.set({ category: c }, f);
  }

  incCompensationRequested(by = 1): void {
    const v = Number.isFinite(by) ? Math.max(0, by) : 0;
    if (v > 0) this.compensationRequestedTotal?.inc({}, v);
  }

  recordExperienceRecapSkipped(reason: 'rate_limited' | 'circuit_open'): void {
    this.experienceRecapSkippedTotal?.inc({ reason });
  }

  observeExperienceDynamicPolicyApplyLatencyMs(result: 'success' | 'error', elapsedMs: number): void {
    this.experienceDynamicPolicyApplyLatencyMs?.observe({ result }, Math.max(0, elapsedMs));
  }

  recordPlanningStructuredValidation(
    result: 'valid' | 'invalid',
    mode: 'structured' | 'legacy' | 'plain_json_fallback',
  ): void {
    this.planningStructuredValidTotal?.inc({ result, mode });
    this.planningStructuredSeen += 1;
    if (result === 'valid') this.planningStructuredValidSeen += 1;
    const rate = this.planningStructuredSeen > 0 ? this.planningStructuredValidSeen / this.planningStructuredSeen : 0;
    this.planningStructuredValidRate?.set({}, Math.max(0, Math.min(1, rate)));
  }

  recordPlanningRepairOutcome(result: 'success' | 'failed'): void {
    this.planningRepairSuccessTotal?.inc({ result });
    this.planningRepairSeen += 1;
    if (result === 'success') this.planningRepairSuccessSeen += 1;
    const rate = this.planningRepairSeen > 0 ? this.planningRepairSuccessSeen / this.planningRepairSeen : 0;
    this.planningRepairSuccessRate?.set({}, Math.max(0, Math.min(1, rate)));
  }

  recordPlanningFallback(reason: string): void {
    const safeReason = (reason || 'unknown').trim() || 'unknown';
    this.planningFallbackTotal?.inc({ reason: safeReason });
    this.planningTotalSeen += 1;
    this.planningFallbackSeen += 1;
    this.updatePlanningFallbackRate();
    this.updatePlanningBlockedRate();
  }

  recordPlanningAccepted(): void {
    this.planningTotalSeen += 1;
    this.updatePlanningFallbackRate();
    this.updatePlanningBlockedRate();
  }

  recordPlanningBlocked(reason: string): void {
    const safeReason = (reason || 'unknown').trim() || 'unknown';
    this.planningBlockedTotal?.inc({ reason: safeReason });
    this.planningTotalSeen += 1;
    this.planningBlockedSeen += 1;
    this.updatePlanningFallbackRate();
    this.updatePlanningBlockedRate();
  }

  recordPlanningValidationErrorCode(code: string): void {
    const safeCode = (code || 'unknown').replace(/[^a-z0-9_.-]/gi, '_').slice(0, 80) || 'unknown';
    this.planningValidationErrorCodeTotal?.inc({ code: safeCode });
  }

  recordPlanningContractAttempt(params: { attempt: number; valid: boolean; finishReason?: string | null }): void {
    const attemptLabel = String(Math.min(Math.max(0, Math.floor(params.attempt)), 9));
    const frRaw = params.finishReason != null && String(params.finishReason).trim() ? String(params.finishReason) : 'unknown';
    const finishReasonBucket = frRaw.replace(/[^a-z0-9_-]/gi, '_').slice(0, 32) || 'unknown';
    this.planningContractRoundTotal?.inc({
      attempt: attemptLabel,
      valid: params.valid ? 'true' : 'false',
      finish_reason_bucket: finishReasonBucket,
    });
  }

  observePlanningLatencyMs(stage: 'model' | 'fallback' | 'total', elapsedMs: number): void {
    this.planningLatencyMs?.observe({ stage }, Math.max(0, elapsedMs));
  }

  private updatePlanningFallbackRate(): void {
    const denom = this.planningTotalSeen;
    const ratio = denom > 0 ? this.planningFallbackSeen / denom : 0;
    this.planningFallbackRateGauge?.set({}, Math.max(0, Math.min(1, ratio)));
  }

  private updatePlanningBlockedRate(): void {
    const denom = this.planningTotalSeen;
    const ratio = denom > 0 ? this.planningBlockedSeen / denom : 0;
    this.planningBlockedRateGauge?.set({}, Math.max(0, Math.min(1, ratio)));
  }

  private updateCeoPreloadSkipRate(): void {
    const denom = this.ceoPreloadSeen;
    const ratio = denom > 0 ? this.ceoPreloadSkipped / denom : 0;
    this.ceoPreloadSkipRate?.set({}, Math.max(0, Math.min(1, ratio)));
  }

  incLlmKeyAcquireOutcome(outcome: 'success' | 'failover' | 'unhealthy' | 'pool_exhausted'): void {
    this.llmKeyAcquireTotal?.inc({ outcome });
  }

  recordLlmKeyResolutionPolicy(policyId: string): void {
    const id = String(policyId || 'unknown')
      .trim()
      .replace(/[^a-z0-9_\-]/gi, '_')
      .slice(0, 64);
    this.llmKeyResolutionPolicyTotal?.inc({ policy_id: id || 'unknown' });
  }

  incCoordinationRedisFallback(reason: string): void {
    const r = String(reason || 'unknown')
      .trim()
      .replace(/[^a-z0-9_\-]/gi, '_')
      .slice(0, 48);
    this.coordinationRedisFallbackTotal?.inc({ reason: r || 'unknown' });
  }

  incCeoGraphLockContention(by = 1): void {
    this.ceoGraphLockContentionTotal?.inc({}, by);
  }

  incAutonomousRunCycle(outcome: 'success' | 'failed', triggerSource: string): void {
    this.autonomousRunCycleTotal?.inc({
      outcome,
      trigger_source: String(triggerSource || 'unknown').slice(0, 32),
    });
  }

  async onModuleDestroy() {
    if (this.metricsManager) {
      await this.metricsManager.close();
    }
  }

  /**
   * 导出 Prometheus 格式的指标
   */
  async exportMetrics(): Promise<string> {
    if (!this.metricsManager) {
      return '';
    }
    return this.metricsManager.export();
  }
}











