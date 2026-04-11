import { Injectable, Inject } from '@nestjs/common';
import { ConfigManager } from '@service/config';
import {
  AppConfig,
  RabbitMQConfig,
  WorkerConfig,
} from './interfaces/config.interface.js';

/**
 * 配置服务
 * 提供类型安全的配置访问
 * 使用 @service/config 进行配置管理
 */
@Injectable()
export class ConfigService {
  private configManager: ConfigManager;

  constructor(@Inject('CONFIG_MANAGER') configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * 获取应用配置
   */
  getAppConfig(): AppConfig {
    return {
      nodeEnv: this.configManager.get<string>('NODE_ENV', 'development'),
      port: this.configManager.get<number>('PORT', 3004),
      version: this.configManager.get<string>('APP_VERSION'),
    };
  }

  /**
   * 获取 RabbitMQ 配置
   */
  getRabbitMQConfig(): RabbitMQConfig {
    return {
      host: this.configManager.get<string>('RABBITMQ_HOST', 'localhost'),
      port: this.configManager.get<number>('RABBITMQ_PORT', 5672),
      user: this.configManager.get<string>('RABBITMQ_USER', 'admin'),
      password: this.configManager.get<string>('RABBITMQ_PASSWORD', 'admin123'),
      vhost: this.configManager.get<string>('RABBITMQ_VHOST', '/'),
      uri: this.configManager.get<string>('RABBITMQ_URI'),
      prefetchCount: this.configManager.get<number>('RABBITMQ_PREFETCH_COUNT', 10),
      reconnectDelay: this.configManager.get<number>('RABBITMQ_RECONNECT_DELAY', 5000),
      maxRetries: this.configManager.get<number>('RABBITMQ_MAX_RETRIES', 10),
    };
  }

  getRedisUrl(): string | undefined {
    const direct = this.configManager.get<string>('REDIS_URL', '');
    return direct?.trim() ? direct.trim() : undefined;
  }

  getRedisKeyPrefix(): string {
    return (this.configManager.get<string>('REDIS_KEY_PREFIX', '') || '').trim();
  }

  getCeoLlmPrepCacheEnabled(): boolean {
    return this.configManager.get<boolean>('CEO_LLM_PREP_CACHE_ENABLED', false);
  }

  getCeoLlmPrepCacheTtlMs(): number {
    return this.configManager.get<number>('CEO_LLM_PREP_CACHE_TTL_MS', 20_000);
  }

  /** 供 RMQ ClientProxy 连接 API 队列（与 apps/api main.ts 一致） */
  getRmqUrl(): string {
    const direct = this.configManager.get<string>('RMQ_URL');
    if (direct) return direct;
    const c = this.getRabbitMQConfig();
    if (c.uri) return c.uri;
    const user = encodeURIComponent(c.user);
    const pass = encodeURIComponent(c.password);
    const vhostPath =
      !c.vhost || c.vhost === '/'
        ? '/'
        : `/${encodeURIComponent(c.vhost.replace(/^\//, ''))}`;
    return `amqp://${user}:${pass}@${c.host}:${c.port}${vhostPath}`;
  }

  /** Runner 微服务 RPC 队列（与 apps/runner main.ts RUNNER_RMQ_QUEUE 一致） */
  getRunnerRpcQueue(): string {
    return this.configManager.get<string>(
      'RUNNER_RMQ_RPC_QUEUE',
      'runner-rpc-queue',
    );
  }

  getApiRpcQueue(): string {
    const workerSpecific = this.configManager.get<string>('WORKER_API_RMQ_RPC_QUEUE');
    if (workerSpecific?.trim()) return workerSpecific.trim();
    const autonomous = this.configManager.get<string>('API_RMQ_RPC_QUEUE_AUTONOMOUS');
    if (autonomous?.trim()) return autonomous.trim();
    return this.configManager.get<string>('API_RMQ_RPC_QUEUE', 'api-rpc-queue');
  }

  /** Worker 所有 ClientProxy.send 类 RPC 的统一超时（与网关单路由超时解耦） */
  getApiRpcTimeoutMs(): number {
    return this.configManager.get<number>('WORKER_API_RPC_TIMEOUT_MS', 120_000);
  }

  /**
   * 协作 @CEO 提及监听器内 RPC（agents / collaboration / tasks）超时。
   * 队列积压时过短会导致「Request timed out」类失败且用户看不到拆解。
   */
  /** 与 API 侧 MARKETPLACE_BINDING_NOTIFY_MAX_COMPANIES 对齐。 */
  getMarketplaceBindingNotifyMaxCompanies(): number {
    const raw = this.configManager.get<number | string | undefined>(
      'MARKETPLACE_BINDING_NOTIFY_MAX_COMPANIES',
    );
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n !== 'number' || Number.isNaN(n)) return 500;
    return Math.min(50_000, Math.max(1, Math.floor(n)));
  }

  getCollaborationMentionRpcTimeoutMs(): number {
    const raw = this.configManager.get<number | string | undefined>(
      'WORKER_COLLAB_MENTION_RPC_TIMEOUT_MS',
    );
    const explicit =
      typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof explicit === 'number' && !Number.isNaN(explicit) && explicit >= 5000) {
      return explicit;
    }
    return Math.max(this.getApiRpcTimeoutMs(), 180_000);
  }

  getWorkerActorUserId(): string {
    return this.configManager.get<string>(
      'WORKER_ACTOR_USER_ID',
      '00000000-0000-4000-8000-000000000001',
    );
  }

  /** @see configSchema TASK_HEARTBEAT_INTERVAL_MS */
  getTaskHeartbeatIntervalMs(): number {
    return this.configManager.get<number>('TASK_HEARTBEAT_INTERVAL_MS', 120_000);
  }

  /** @see configSchema TASK_HEARTBEAT_MAX_COMPANIES_PER_TICK */
  getTaskHeartbeatMaxCompaniesPerTick(): number {
    return this.configManager.get<number>('TASK_HEARTBEAT_MAX_COMPANIES_PER_TICK', 20);
  }

  getTaskHeartbeatSource(): 'nest_timer' | 'temporal' {
    const v = this.configManager.get<string>('TASK_HEARTBEAT_SOURCE', 'nest_timer');
    return v === 'temporal' ? 'temporal' : 'nest_timer';
  }

  isCompanyStuckTaskDetectionEnabled(): boolean {
    return this.configManager.get<boolean>('COMPANY_STUCK_TASK_DETECTION_ENABLED', true);
  }

  getCompanyStuckMaxHoursInProgress(): number {
    return this.configManager.get<number>('COMPANY_STUCK_MAX_HOURS_IN_PROGRESS', 4);
  }

  getCompanyStuckMaxHoursBlocked(): number {
    return this.configManager.get<number>('COMPANY_STUCK_MAX_HOURS_BLOCKED', 2);
  }

  getCompanyStuckEmergencyThreshold(): number {
    return this.configManager.get<number>('COMPANY_STUCK_EMERGENCY_THRESHOLD', 3);
  }

  getCompanyStuckMaxSelfMentionRetries(): number {
    return this.configManager.get<number>('COMPANY_STUCK_MAX_SELF_MENTION_RETRIES', 2);
  }

  getWorkerInternalApiSecret(): string | undefined {
    const s = this.configManager.get<string>('WORKER_INTERNAL_API_SECRET', '');
    const t = s?.trim();
    return t || undefined;
  }

  getOpenAiApiKey(): string | undefined {
    const v = this.configManager.get<string>('OPENAI_API_KEY', '');
    return v?.trim() ? v.trim() : undefined;
  }

  getAnthropicApiKey(): string | undefined {
    const v = this.configManager.get<string>('ANTHROPIC_API_KEY', '');
    return v?.trim() ? v.trim() : undefined;
  }

  getCeoLlmTimeoutMs(): number {
    return this.configManager.get<number>('CEO_LLM_TIMEOUT_MS', 120_000);
  }

  /** 协作群 CEO 回复：默认不低于 240s，减少 OpenAI「Request timed out」误报 */
  getCollaborationLlmTimeoutMs(): number {
    const raw = this.configManager.get<number | string | undefined>('WORKER_COLLAB_LLM_TIMEOUT_MS');
    const explicit =
      typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof explicit === 'number' && !Number.isNaN(explicit) && explicit >= 5000) {
      return explicit;
    }
    return Math.max(this.getCeoLlmTimeoutMs(), 240_000);
  }

  /** CEO plan 的 context= 前缀最大长度（字符） */
  getCeoPlanContextMaxChars(): number {
    const raw = this.configManager.get<number | string | undefined>('WORKER_CEO_PLAN_CONTEXT_MAX_CHARS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 2000) {
      return n;
    }
    return 12_000;
  }

  /** breakdown + glm* 时与 getCeoPlanContextMaxChars 取较小值，减轻上游 ~150s 读超时 */
  getCeoGlmPlanContextMaxChars(): number {
    const raw = this.configManager.get<number | string | undefined>('WORKER_CEO_GLM_PLAN_CONTEXT_MAX_CHARS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 2000) {
      return n;
    }
    return 4000;
  }

  /** breakdown + glm* 时限制生成长度，利于在 ~150s 内完成 */
  getCeoGlmMaxOutputTokens(): number {
    const raw = this.configManager.get<number | string | undefined>('WORKER_CEO_GLM_MAX_OUTPUT_TOKENS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 256 && n <= 8192) {
      return n;
    }
    return 1280;
  }

  isCeoGlmSlimContextEnabled(): boolean {
    return this.configManager.get<boolean>('WORKER_CEO_GLM_SLIM_CONTEXT_ENABLED', true);
  }

  getCeoPlanContextSliceChars(modelName: string, runKind: string): number {
    const general = this.getCeoPlanContextMaxChars();
    const isBreakdown = runKind === 'breakdown';
    const isGlm = (modelName || '').toLowerCase().includes('glm');
    if (isBreakdown && isGlm) {
      return Math.min(general, this.getCeoGlmPlanContextMaxChars());
    }
    return general;
  }

  /** 与 WorkerApiRpcModule 中 API_RPC_CLIENT_INTERACTIVE 一致（该 Client 目前读 process.env.API_RMQ_RPC_QUEUE） */
  getInteractiveApiRpcQueue(): string {
    const env = process.env.API_RMQ_RPC_QUEUE?.trim();
    return env && env.length > 0 ? env : 'api-rpc-queue';
  }

  isCeoInteractiveQueueEnabled(): boolean {
    return this.configManager.get<boolean>('CEO_INTERACTIVE_QUEUE_ENABLED', false);
  }

  getCeoInteractiveQueueName(): string {
    return this.configManager.get<string>('CEO_INTERACTIVE_QUEUE_NAME', 'ceo-interactive-queue');
  }

  getCeoInteractivePrefetch(): number {
    return this.configManager.get<number>('CEO_INTERACTIVE_PREFETCH', 25);
  }

  getCeoInteractiveTimeoutMs(): number {
    return this.configManager.get<number>('CEO_INTERACTIVE_TIMEOUT_MS', 8000);
  }

  getCeoBreakdownIngestTaskPageSize(): number {
    const raw = this.configManager.get<number | string | undefined>(
      'WORKER_CEO_BREAKDOWN_INGEST_TASK_PAGE_SIZE',
    );
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 5 && n <= 100) {
      return n;
    }
    return 20;
  }

  getCeoLlmMaxOutputTokens(): number {
    return this.configManager.get<number>('CEO_LLM_MAX_OUTPUT_TOKENS', 4096);
  }

  getCeoLlmEstimatedCost(): number {
    return this.configManager.get<number>('CEO_LLM_ESTIMATED_COST', 0);
  }

  getAgentSkillBudgetEstimate(): number {
    return this.configManager.get<number>('AGENT_SKILL_BUDGET_ESTIMATE', 0.01);
  }

  /**
   * Mandatory approval gate for autonomous budget spend.
   * 0 means disabled.
   */
  getBudgetApprovalThreshold(): number {
    return this.configManager.get<number>('WORKER_BUDGET_APPROVAL_THRESHOLD', 0);
  }

  getExternalSkillBudgetEstimate(): number {
    return this.configManager.get<number>('EXTERNAL_SKILL_BUDGET_ESTIMATE', 0.05);
  }

  getCeoReportMaxChars(): number {
    return this.configManager.get<number>('CEO_REPORT_MAX_CHARS', 8000);
  }

  getAutonomousCooldownTaskCompletedMs(): number {
    return this.configManager.get<number>('AUTONOMOUS_COOLDOWN_TASK_COMPLETED_MS', 120_000);
  }

  getAutonomousCooldownBudgetWarningMs(): number {
    return this.configManager.get<number>('AUTONOMOUS_COOLDOWN_BUDGET_WARNING_MS', 900_000);
  }

  isAutonomousMemoryAdapterEnabled(): boolean {
    return this.configManager.get<boolean>('ENABLE_AUTONOMOUS_MEMORY_ADAPTER', true);
  }

  getAutonomousMemoryStoreMode(): 'ceo_autonomous' | 'session' {
    return this.configManager.get<'ceo_autonomous' | 'session'>(
      'AUTONOMOUS_MEMORY_STORE_MODE',
      'ceo_autonomous',
    );
  }

  isMemoryConsolidationEnabled(): boolean {
    return this.configManager.get<boolean>('ENABLE_MEMORY_CONSOLIDATION', false);
  }

  /** 渐进启用 ACP 协议消费路径（默认关闭）。 */
  isAcpProtocolEnabled(): boolean {
    return this.configManager.get<boolean>('ENABLE_ACP_PROTOCOL', false);
  }

  isLayeredGraphEnabled(): boolean {
    return this.configManager.get<boolean>('ENABLE_LAYERED_GRAPH', false);
  }

  getWorkerCheckpointDatabaseUrl(): string | undefined {
    const v = this.configManager.get<string>('WORKER_CHECKPOINT_DATABASE_URL', '');
    return v?.trim() ? v.trim() : undefined;
  }

  getLanggraphCheckpointSchema(): string {
    return this.configManager.get<string>('LANGGRAPH_CHECKPOINT_SCHEMA', 'langgraph_checkpoint');
  }

  getCollabIntentModel(): string {
    return (this.configManager.get<string>('COLLAB_INTENT_MODEL', '') ?? '').trim();
  }

  getCollabIntentLlmTimeoutMs(): number {
    return this.configManager.get<number>('COLLAB_INTENT_LLM_TIMEOUT_MS', 8000);
  }

  getCollabIntentConfidenceThreshold(): number {
    return this.configManager.get<number>('COLLAB_INTENT_CONFIDENCE_THRESHOLD', 0.85);
  }

  /** 未单独配置时与 COLLAB_INTENT_MODEL 共用 */
  getCeoClassifierModel(): string {
    const direct = (this.configManager.get<string>('CEO_CLASSIFIER_MODEL', '') ?? '').trim();
    if (direct) return direct;
    return this.getCeoDecisionModel();
  }

  getCeoLightModel(): string {
    const direct = (this.configManager.get<string>('CEO_LIGHT_MODEL', '') ?? '').trim();
    if (direct) return direct;
    const fallback = this.getCollabDirectReplyModel().trim();
    return fallback || 'gpt-4o-mini';
  }

  getCeoHeavyModel(): string {
    const direct = (this.configManager.get<string>('CEO_HEAVY_MODEL', '') ?? '').trim();
    if (direct) return direct;
    const fallback = (this.configManager.get<string>('CEO_LLM_MODEL', '') ?? '').trim();
    return fallback || 'gpt-4o-mini';
  }

  /** @deprecated use getCeoClassifierModel() */
  getCeoDecisionModel(): string {
    const direct = (this.configManager.get<string>('CEO_DECISION_MODEL', '') ?? '').trim();
    if (direct) return direct;
    return this.getCollabIntentModel();
  }

  getCeoDecisionLlmTimeoutMs(): number {
    const raw = this.configManager.get<number | string | undefined>('CEO_DECISION_LLM_TIMEOUT_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 1000) {
      return n;
    }
    return Math.max(this.getCollabIntentLlmTimeoutMs(), 12_000);
  }

  getCeoDecisionMaxOutputTokens(): number {
    return this.configManager.get<number>('CEO_DECISION_MAX_OUTPUT_TOKENS', 512);
  }

  getCeoDecisionMaxContextMessages(): number {
    return this.configManager.get<number>('CEO_DECISION_MAX_CONTEXT_MESSAGES', 40);
  }

  isCeoDecisionCacheEnabled(): boolean {
    return this.configManager.get<boolean>('CEO_DECISION_CACHE_ENABLED', true);
  }

  getCeoDecisionCacheTtlMs(): number {
    return this.configManager.get<number>('CEO_DECISION_CACHE_TTL_MS', 120_000);
  }

  isCeoPreloadEnabled(): boolean {
    return this.configManager.get<boolean>('CEO_PRELOAD_ENABLED', false);
  }

  getCeoPreloadPrefetch(): number {
    return this.configManager.get<number>('CEO_PRELOAD_PREFETCH', 10);
  }

  getCeoPreloadMaxConcurrency(): number {
    return this.configManager.get<number>('CEO_PRELOAD_MAX_CONCURRENCY', 15);
  }

  getCeoPreloadCooldownMs(): number {
    return this.configManager.get<number>('CEO_PRELOAD_COOLDOWN_MS', 30_000);
  }

  isCeoFastpathEnabled(): boolean {
    return this.configManager.get<boolean>('CEO_FASTPATH_ENABLED', true);
  }

  getCeoFastpathHighConfidenceThreshold(): number {
    return this.configManager.get<number>('CEO_FASTPATH_HIGH_CONFIDENCE_THRESHOLD', 0.92);
  }

  getCeoFastpathMediumConfidenceThreshold(): number {
    return this.configManager.get<number>('CEO_FASTPATH_MEDIUM_CONFIDENCE_THRESHOLD', 0.87);
  }

  getCeoFastpathConfidenceGap(): number {
    return this.configManager.get<number>('CEO_FASTPATH_CONFIDENCE_GAP', 0.08);
  }

  getCeoClassifierTimeoutMs(): number {
    return this.configManager.get<number>('CEO_CLASSIFIER_TIMEOUT_MS', 400);
  }

  getCeoLightTimeoutMs(): number {
    return this.configManager.get<number>('CEO_LIGHT_TIMEOUT_MS', 2500);
  }

  getCeoLightPrimaryTimeoutMs(): number {
    return this.configManager.get<number>('CEO_LIGHT_PRIMARY_TIMEOUT_MS', 6000);
  }

  getCeoLightFallbackTimeoutMs(): number {
    return this.configManager.get<number>('CEO_LIGHT_FALLBACK_TIMEOUT_MS', 4000);
  }

  getCeoHeavyTimeoutMs(): number {
    return this.configManager.get<number>('CEO_HEAVY_TIMEOUT_MS', 12000);
  }

  getCeoDecisionHeuristicMinConfidence(): number {
    return this.configManager.get<number>('CEO_DECISION_HEURISTIC_MIN_CONFIDENCE', 0.85);
  }

  isCeoDecisionSyncRoomModeEnabled(): boolean {
    return this.configManager.get<boolean>('CEO_DECISION_SYNC_ROOM_MODE', true);
  }

  isCeoRoomApprovalInterruptEnabled(): boolean {
    return this.configManager.get<boolean>('CEO_ROOM_APPROVAL_INTERRUPT_ENABLED', true);
  }

  getDiscussionModerationMaxSpeakers(): number {
    return this.configManager.get<number>('DISCUSSION_MODERATION_MAX_SPEAKERS', 4);
  }

  getCollabDirectReplyModel(): string {
    return this.configManager.get<string>('WORKER_COLLAB_DIRECT_MODEL', 'gpt-4o-mini');
  }

  /** 直聊多轮上下文：拉取最近若干条 chat_messages（0=关闭） */
  getCollabDirectReplyHistoryLimit(): number {
    return this.configManager.get<number>('WORKER_COLLAB_DIRECT_HISTORY_LIMIT', 8);
  }

  isGroupChatMemoryRetrievalEnabled(): boolean {
    return this.configManager.get<boolean>('WORKER_GROUP_CHAT_MEMORY_RETRIEVAL', true);
  }

  getGroupChatMemoryRetrievalTopK(): number {
    return this.configManager.get<number>('WORKER_GROUP_CHAT_MEMORY_TOP_K', 8);
  }

  getGroupChatDigestTranscriptLimit(): number {
    return this.configManager.get<number>('WORKER_GROUP_CHAT_DIGEST_TRANSCRIPT_LIMIT', 40);
  }

  isDirectReplyAutoConsolidateEnabled(): boolean {
    return this.configManager.get<boolean>('WORKER_DIRECT_REPLY_AUTO_CONSOLIDATE', true);
  }

  getCollabStreamMinIntervalMs(mode: 'quick' | 'structured'): number {
    if (mode === 'structured') {
      return this.configManager.get<number>('WORKER_COLLAB_STREAM_STRUCTURED_MIN_INTERVAL_MS', 75);
    }
    return this.configManager.get<number>('WORKER_COLLAB_STREAM_MIN_INTERVAL_MS', 60);
  }

  getCollabStreamMinChars(mode: 'quick' | 'structured'): number {
    if (mode === 'structured') {
      return this.configManager.get<number>('WORKER_COLLAB_STREAM_STRUCTURED_MIN_CHARS', 15);
    }
    return this.configManager.get<number>('WORKER_COLLAB_STREAM_MIN_CHARS', 12);
  }

  isSupervisorPostReviewEnabled(): boolean {
    return this.configManager.get<boolean>('WORKER_SUPERVISOR_POST_REVIEW_ENABLED', true);
  }

  getSupervisorPostReviewMaxFindings(): number {
    return this.configManager.get<number>('WORKER_SUPERVISOR_POST_REVIEW_MAX_FINDINGS', 3);
  }

  isSupervisorPostReviewChatEnabled(): boolean {
    return this.configManager.get<boolean>('WORKER_SUPERVISOR_POST_REVIEW_CHAT_ENABLED', true);
  }

  getSupervisorPostReviewModel(): string {
    const s = this.configManager.get<string>('WORKER_SUPERVISOR_POST_REVIEW_MODEL', '');
    return s?.trim() || this.getCollabDirectReplyModel();
  }

  getSupervisorPostReviewLlmTimeoutMs(): number {
    return this.configManager.get<number>('WORKER_SUPERVISOR_POST_REVIEW_LLM_TIMEOUT_MS', 12000);
  }

  getParallelDiscussionMinAgents(): number {
    return this.configManager.get<number>('WORKER_PARALLEL_DISCUSSION_MIN_AGENTS', 2);
  }

  getParallelDiscussionMaxAgents(): number {
    return this.configManager.get<number>('WORKER_PARALLEL_DISCUSSION_MAX_AGENTS', 5);
  }

  getParallelDiscussionTimeoutMinutes(): number {
    return this.configManager.get<number>('WORKER_PARALLEL_DISCUSSION_TIMEOUT_MINUTES', 10);
  }

  isSupervisorReviewChatSummaryEnabled(): boolean {
    return this.configManager.get<boolean>('WORKER_SUPERVISOR_REVIEW_CHAT_SUMMARY_ENABLED', true);
  }

  getWorkerAllowUnsafeSkillStubs(): boolean {
    return this.configManager.get<boolean>('WORKER_ALLOW_UNSAFE_SKILL_STUBS', false);
  }

  getSkillHttpTimeoutMs(): number {
    return this.configManager.get<number>('SKILL_HTTP_TIMEOUT_MS', 15000);
  }

  /** @returns normalized allowlist entries (host or host:port) */
  getSkillHttpAllowlist(): string[] {
    const raw = this.configManager.get<string>('SKILL_HTTP_ALLOWLIST', '');
    return (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** 告警 Webhook 列表（trim + 去空） */
  getAlertWebhookUrls(): string[] {
    const raw = this.configManager.get<string>('ALERT_WEBHOOK_URLS', '');
    return (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  getAdminPublicBaseUrl(): string {
    return (this.configManager.get<string>('ADMIN_PUBLIC_BASE_URL', '') || '').trim();
  }

  /**
   * 获取完整配置
   */
  getConfig(): WorkerConfig {
    return {
      app: this.getAppConfig(),
      rabbitmq: this.getRabbitMQConfig(),
    };
  }
}









