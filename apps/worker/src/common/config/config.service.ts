import { Injectable, Inject } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigManager } from '@service/config';
import {
  AppConfig,
  RabbitMQConfig,
  WorkerConfig,
} from './interfaces/config.interface.js';
import { DEFAULT_COLLABORATION_DIAGNOSTIC_FALLBACK_MESSAGE } from '../../config/collaboration.config.js';
import { CollaborationMainChainSettingsOverlayService } from './collaboration-main-chain-settings-overlay.service.js';
import type { CollaborationMainChainSettingKey } from './collaboration-main-chain-settings.types.js';

/**
 * 配置服务
 * 提供类型安全的配置访问
 * 使用 @service/config 进行配置管理
 */
@Injectable()
export class ConfigService {
  private configManager: ConfigManager;

  constructor(
    @Inject('CONFIG_MANAGER') configManager: ConfigManager,
    private readonly moduleRef: ModuleRef,
  ) {
    // In miswired DI / partial test modules, CONFIG_MANAGER can be undefined at runtime
    // which later surfaces as "Cannot read properties of undefined (reading 'get')".
    // Prefer a clear, actionable failure or a safe singleton fallback.
    this.configManager =
      (configManager as unknown as ConfigManager | undefined) ??
      (() => {
        try {
          return ConfigManager.getInstance();
        } catch {
          return undefined;
        }
      })();

    if (!this.configManager) {
      throw new Error(
        'Worker ConfigService: CONFIG_MANAGER is not initialized. ' +
          'Ensure ConfigModule is imported (it provides CONFIG_MANAGER via ConfigManager.create()).',
      );
    }
  }

  /** 延迟解析 overlay，避免 ConfigModule ↔ WorkerApiRpcModule 循环依赖。 */
  private mainChainOverlay(): CollaborationMainChainSettingsOverlayService | undefined {
    return this.moduleRef.get(CollaborationMainChainSettingsOverlayService, { strict: false });
  }

  /**
   * Generic accessor for legacy callers.
   * Prefer dedicated typed getters for new code.
   */
  get<T>(key: string, defaultValue?: T): T {
    return this.configManager.get<T>(key, defaultValue as T);
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

  /** 跨 API/Worker 共享协作 KV；见 API `ConfigService.getCollabRedisUrl`。 */
  getCollabRedisUrl(): string | undefined {
    const collab = this.configManager.get<string>('COLLAB_REDIS_URL', '');
    if (collab?.trim()) return collab.trim();
    const serviceUrl = this.getRedisUrl();
    if (serviceUrl?.trim()) return serviceUrl.trim();
    const host = this.configManager.get<string>('REDIS_HOST', '').trim();
    if (!host) return undefined;
    const port = this.configManager.get<number>('REDIS_PORT', 6379);
    const password = this.configManager.get<string>('REDIS_PASSWORD', '');
    const collabDb = this.configManager.get<number>('REDIS_DB_COLLAB', 0);
    const auth = password?.trim() ? `:${encodeURIComponent(password.trim())}@` : '';
    return `redis://${auth}${host}:${port}/${collabDb}`;
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

  getL2ReplyFactsCacheTtlMs(): number {
    return this.configManager.get<number>('L2_REPLY_FACTS_CACHE_TTL_MS', 60_000);
  }

  getL2ReplyCacheTtlMs(): number {
    return this.configManager.get<number>('L2_REPLY_CACHE_TTL_MS', 30_000);
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

  /** apps/runner `runner.execute` 专用超时 */
  getRunnerExecuteTimeoutMs(): number {
    return this.configManager.get<number>('WORKER_RUNNER_EXECUTE_TIMEOUT_MS', 120_000);
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

  /** billing.record.append 专用超时（默认为 5 分钟，避免事务/积压导致误超时） */
  getBillingAppendTimeoutMs(): number {
    return this.configManager.get<number>('WORKER_BILLING_APPEND_TIMEOUT_MS', 300_000);
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

  /** P20：为 true 时 Worker 在收到 `marketplace.skill_version.published` 后对非高危目标尝试自动 semver 升级 */
  getMarketplaceSkillAutoUpgradeSafe(): boolean {
    const raw = this.configManager.get<string | boolean | undefined>('FOUNDRY_MARKETPLACE_SKILL_AUTO_UPGRADE_SAFE');
    if (raw === true) return true;
    if (typeof raw === 'string') {
      const v = raw.trim().toLowerCase();
      return v === '1' || v === 'true' || v === 'yes';
    }
    return false;
  }

  /**
   * 为 true 时：人类用户 @ 非 CEO Agent 的直聊也会注入人类身份上下文（默认 false，减少 Agent 间噪声）。
   */
  getEnableHumanIdentityForAllAgents(): boolean {
    const raw = this.configManager.get<string | boolean | undefined>(
      'FOUNDRY_ENABLE_HUMAN_IDENTITY_ALL_AGENTS',
    );
    if (raw === true) return true;
    if (typeof raw === 'string') {
      const v = raw.trim().toLowerCase();
      return v === '1' || v === 'true' || v === 'yes';
    }
    return false;
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

  /**
   * `AgentsActiveDirectoryCacheService` → API `agents.findAll` 的 pageSize（须与 API `QueryAgentsDto` @Max 一致）。
   */
  getAgentsActiveDirectoryPageSize(): number {
    const raw = this.configManager.get<number | string | undefined>('AGENTS_ACTIVE_DIRECTORY_PAGE_SIZE');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n !== 'number' || Number.isNaN(n)) return 100;
    return Math.min(500, Math.max(1, Math.floor(n)));
  }

  getWorkerActorUserId(): string {
    const fallback = '00000000-0000-4000-8000-000000000001';
    const value = this.configManager.get<string>(
      'WORKER_ACTOR_USER_ID',
      fallback,
    );
    const normalized = String(value ?? '').trim();
    const uuidV4Like = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidV4Like.test(normalized) ? normalized : fallback;
  }

  /** P12：shell/code-run 执行前是否强制 API 侧 mint `runner.exec` token（默认 true） */
  getCeoRequireExecutionToken(): boolean {
    return this.configManager.get<boolean>('FOUNDRY_CEO_REQUIRE_EXECUTION_TOKEN', true);
  }

  /** @see configSchema TASK_HEARTBEAT_INTERVAL_MS */
  getTaskHeartbeatIntervalMs(): number {
    return this.configManager.get<number>('TASK_HEARTBEAT_INTERVAL_MS', 600_000);
  }

  isHeartbeatTieredCeoGraphEnabled(): boolean {
    return this.configManager.get<boolean>('HEARTBEAT_TIERED_CEO_GRAPH_ENABLED', true);
  }

  getCeoLlmPlanForceIntervalMs(): number {
    const raw = this.configManager.get<number | string | undefined>('CEO_LLM_PLAN_FORCE_INTERVAL_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 60_000) {
      return Math.min(604_800_000, Math.floor(n));
    }
    return 3_600_000;
  }

  getHeartbeatSteadyHealthMin(): number {
    const raw = this.configManager.get<number | string | undefined>('HEARTBEAT_STEADY_HEALTH_MIN');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100) {
      return Math.floor(n);
    }
    return 65;
  }

  /** 同公司两次心跳执行的最小间隔（毫秒） */
  getHeartbeatMinIntervalMs(): number {
    const raw = this.configManager.get<number | string | undefined>('HEARTBEAT_MIN_INTERVAL_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      return Math.min(86_400_000, Math.floor(n));
    }
    return 60_000;
  }

  /** @see configSchema TASK_HEARTBEAT_MAX_COMPANIES_PER_TICK */
  getTaskHeartbeatMaxCompaniesPerTick(): number {
    return this.configManager.get<number>('TASK_HEARTBEAT_MAX_COMPANIES_PER_TICK', 20);
  }

  /**
   * 最近有人类交互时，心跳任务让路窗口（毫秒）。
   * 用于隔离 interactive/background 资源，减少用户链路抖动。
   */
  getHeartbeatInteractiveCooldownMs(): number {
    const raw = this.configManager.get<number | string | undefined>('HEARTBEAT_INTERACTIVE_COOLDOWN_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      return Math.min(300_000, Math.floor(n));
    }
    return 20_000;
  }

  getTaskHeartbeatSource(): 'nest_timer' | 'temporal' {
    const v = this.configManager.get<string>('TASK_HEARTBEAT_SOURCE', 'nest_timer');
    return v === 'temporal' ? 'temporal' : 'nest_timer';
  }

  isCompanyExecutionCoordinationRedisEnabled(): boolean {
    return Boolean(this.configManager.get<boolean>('COMPANY_EXECUTION_COORDINATION_REDIS_ENABLED', true));
  }

  getCeoHeartbeatLockTtlMs(): number {
    return this.configManager.get<number>('CEO_HEARTBEAT_LOCK_TTL_MS', 180_000);
  }

  getCeoGraphLockTtlMs(): number {
    return this.configManager.get<number>('CEO_GRAPH_LOCK_TTL_MS', 300_000);
  }

  isWorkerMultiInstanceStrict(): boolean {
    return Boolean(this.configManager.get<boolean>('WORKER_MULTI_INSTANCE_STRICT', false));
  }

  isHeartbeatTickRethrowOnFailure(): boolean {
    return Boolean(this.configManager.get<boolean>('HEARTBEAT_TICK_RETHROW_ON_FAILURE', true));
  }

  isCompanyEmergencyRecoveryRunPending(): boolean {
    return Boolean(this.configManager.get<boolean>('COMPANY_EMERGENCY_RECOVERY_RUN_PENDING', true));
  }

  getPendingAgentTasksMaxPerTick(): number {
    return this.configManager.get<number>('PENDING_AGENT_TASKS_MAX_PER_TICK', 50);
  }

  isWorkerCheckpointRequired(): boolean {
    return Boolean(this.configManager.get<boolean>('WORKER_CHECKPOINT_REQUIRED', false));
  }

  isWorkerDirectorTemporalEnabled(): boolean {
    return Boolean(this.configManager.get<boolean>('WORKER_DIRECTOR_TEMPORAL_ENABLED', false));
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

  isCompanyHeartbeatChatReportEnabled(): boolean {
    return this.configManager.get<boolean>('COMPANY_HEARTBEAT_CHAT_REPORT_ENABLED', false);
  }

  getCompanyHeartbeatReportDedupWindowMs(): number {
    const raw = this.configManager.get<number | string | undefined>(
      'COMPANY_HEARTBEAT_REPORT_DEDUP_WINDOW_MS',
    );
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      return Math.min(86_400_000, Math.floor(n));
    }
    return 600_000;
  }

  /** PR5：Heartbeat ↔ 协作主群事件关联（metadata + AMQP 审计字段） */
  isCollabHeartbeatCorrelationEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_HEARTBEAT_CORRELATION_ENABLED', true);
  }

  /** 单条消息执行状态：发布 lifecycle.v1 单次领域事件（默认开） */
  isCollabExecutionLifecycleSingleEvent(): boolean {
    return this.configManager.get<boolean>('COLLAB_EXECUTION_LIFECYCLE_SINGLE_EVENT', true);
  }

  /** 是否仍按阶段发布 state_changed.v2（默认关；可与 lifecycle 双写） */
  isCollabExecutionStateLegacyPerStage(): boolean {
    return this.configManager.get<boolean>('COLLAB_EXECUTION_STATE_LEGACY_PER_STAGE', false);
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

  /** Worker 交互链路 RPC 队列；未配置时回退到 getApiRpcQueue，避免跨环境错绑。 */
  getInteractiveApiRpcQueue(): string {
    const workerInteractive = this.configManager.get<string>('WORKER_API_RMQ_RPC_QUEUE_INTERACTIVE');
    if (workerInteractive?.trim()) return workerInteractive.trim();
    const globalInteractive = this.configManager.get<string>('API_RMQ_RPC_QUEUE_INTERACTIVE');
    if (globalInteractive?.trim()) return globalInteractive.trim();
    return this.getApiRpcQueue();
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

  getAutonomousPlanRateLimitCooldownMs(): number {
    const raw = this.configManager.get<number | string | undefined>('AUTONOMOUS_PLAN_RATE_LIMIT_COOLDOWN_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1_000) return n;
    return 90_000;
  }

  getAutonomousPlan429RetryMaxAttempts(): number {
    const raw = this.configManager.get<number | string | undefined>('AUTONOMOUS_PLAN_429_RETRY_MAX_ATTEMPTS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n)) return Math.max(0, Math.min(3, n));
    return 1;
  }

  getAutonomousPlan429BackoffBaseMs(): number {
    const raw = this.configManager.get<number | string | undefined>('AUTONOMOUS_PLAN_429_BACKOFF_BASE_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 200) return n;
    return 1200;
  }

  getAutonomousPlanSingleFlightTtlMs(): number {
    const raw = this.configManager.get<number | string | undefined>('AUTONOMOUS_PLAN_SINGLE_FLIGHT_TTL_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1_000) return n;
    return 120_000;
  }

  getCeoInteractiveFallbackCooldownMs(): number {
    return this.configManager.get<number>('CEO_INTERACTIVE_FALLBACK_COOLDOWN_MS', 45_000);
  }

  getCeoInteractiveFallbackOpenThreshold(): number {
    return this.configManager.get<number>('CEO_INTERACTIVE_FALLBACK_OPEN_THRESHOLD', 3);
  }

  getCeoInteractiveFallbackMaxInflight(): number {
    return this.configManager.get<number>('CEO_INTERACTIVE_FALLBACK_MAX_INFLIGHT', 4);
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

  isCollabIntentLlmEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_INTENT_LLM_ENABLED', true);
  }

  isCollabResponderThinkingEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_RESPONDER_THINKING_ENABLED', true);
  }

  /** 阶段 9：思考气泡 RPC 轻量重试次数（默认 2，不含首次）。 */
  getCollabResponderThinkingRetryAttempts(): number {
    const n = this.configManager.get<number>('COLLAB_RESPONDER_THINKING_RETRY_ATTEMPTS', 2);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 2;
    return Math.max(1, Math.min(4, Math.floor(n)));
  }

  getCollabIntentLlmTimeoutMs(): number {
    return this.configManager.get<number>('COLLAB_INTENT_LLM_TIMEOUT_MS', 8000);
  }

  /**
   * 受众路由 LLM 是否注入 `retrieveBeforeIntent` 记忆：`none` | `digest`（默认，压缩片段）| `full`。
   */
  getCollabRoutingMemoryMode(): 'none' | 'digest' | 'full' {
    const raw = String(this.configManager.get<string>('COLLAB_ROUTING_MEMORY_MODE', 'digest') ?? 'digest')
      .trim()
      .toLowerCase();
    if (raw === 'digest' || raw === 'full') return raw;
    return 'none';
  }

  /** CEO v2 tool summarize LLM 调用超时（与上游 P99 对齐，默认 15s）。 */
  getCollabCeoV2ToolSummarizeTimeoutMs(): number {
    const n = this.configManager.get<number>('COLLAB_CEO_V2_TOOL_SUMMARIZE_TIMEOUT_MS', 15_000);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 15_000;
    return Math.max(3_000, Math.min(120_000, Math.floor(n)));
  }

  /**
   * 同步（非 Temporal）监督路径耗时观测阈值；超出则打 `inline_budget_exceeded` 告警。默认 43s 与常见 P99 对齐。
   * 环境变量：`COLLAB_SUPERVISION_INLINE_BUDGET_MS`。
   */
  getCollabSupervisionInlineBudgetMs(): number {
    const n = this.configManager.get<number>('COLLAB_SUPERVISION_INLINE_BUDGET_MS', 43_000);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 43_000;
    return Math.max(5_000, Math.min(300_000, Math.floor(n)));
  }

  /**
   * CEO v2 各层工具面：`off` 不裁剪；`warn` 按 allowlist 裁剪并打日志；`strict` 存在未允许工具则抛错。
   * 环境变量：`COLLAB_CEO_V2_TOOL_SURFACE_MODE`。
   */
  getCeoV2ToolSurfaceMode(): 'off' | 'warn' | 'strict' {
    const raw = String(this.configManager.get<string>('COLLAB_CEO_V2_TOOL_SURFACE_MODE', 'off') ?? 'off')
      .trim()
      .toLowerCase();
    if (raw === 'warn' || raw === 'strict') return raw;
    return 'off';
  }

  private parseCommaNameList(raw: string | undefined): string[] {
    const s = String(raw ?? '')
      .split(/[,;\s]+/g)
      .map((x) => x.trim())
      .filter(Boolean);
    return Array.from(new Set(s));
  }

  /** 逗号分隔 function `name`，空表示不启用该层 allowlist。 */
  /**
   * Company-enabled toolsets (comma-separated). Non-empty enables skill filtering via metadata.requiresToolsets.
   * Env: `FOUNDRY_ENABLED_TOOLSETS`.
   */
  getEnabledToolsets(): string[] {
    return this.parseCommaNameList(this.configManager.get<string>('FOUNDRY_ENABLED_TOOLSETS', '') ?? '');
  }

  /** Env: `FOUNDRY_TOOL_SEARCH_ENABLED` (default false). */
  isToolSearchEnabled(): boolean {
    const raw = String(this.configManager.get<string>('FOUNDRY_TOOL_SEARCH_ENABLED', 'false') ?? 'false')
      .trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  /** When tool count exceeds this, collapse to skill catalog + foundry.tool_catalog. Env: `FOUNDRY_TOOL_SEARCH_THRESHOLD` (default 48). */
  getToolSearchThreshold(): number {
    const n = this.configManager.get<number>('FOUNDRY_TOOL_SEARCH_THRESHOLD', 48);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 48;
    return Math.max(8, Math.min(200, Math.floor(n)));
  }

  getCeoV2ToolSurfaceAllowlist(
    layer: 'planning' | 'orchestration' | 'supervision',
  ): string[] {
    const key =
      layer === 'planning'
        ? 'COLLAB_CEO_V2_TOOL_SURFACE_PLANNING_ALLOWLIST'
        : layer === 'orchestration'
          ? 'COLLAB_CEO_V2_TOOL_SURFACE_ORCHESTRATION_ALLOWLIST'
          : 'COLLAB_CEO_V2_TOOL_SURFACE_SUPERVISION_ALLOWLIST';
    return this.parseCommaNameList(this.configManager.get<string>(key, '') ?? '');
  }

  /** 进程内 `agents.llmKeyPoolCandidates` 结果缓存 TTL。 */
  getCollabLlmKeyPoolCacheTtlMs(): number {
    const n = this.configManager.get<number>('COLLAB_LLM_KEY_POOL_CACHE_TTL_MS', 60_000);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 60_000;
    return Math.max(5_000, Math.min(300_000, Math.floor(n)));
  }

  getPredictiveMoeTimeoutMs(): number {
    return this.configManager.get<number>('PREDICTIVE_MOE_TIMEOUT_MS', 20000);
  }

  getPredictiveMoeShortCircuitConfidence(): number {
    const raw = this.configManager.get<number>('PREDICTIVE_MOE_SHORT_CIRCUIT_CONFIDENCE', 0.9);
    if (!Number.isFinite(raw)) return 0.9;
    return Math.max(0, Math.min(1, raw));
  }

  getPredictiveMoeFallbackTimeoutMs(): number {
    const raw = this.configManager.get<number>('PREDICTIVE_MOE_FALLBACK_TIMEOUT_MS', 6000);
    if (!Number.isFinite(raw)) return 6000;
    return Math.max(1000, Math.floor(raw));
  }

  getCollabIntentConfidenceThreshold(): number {
    return this.configManager.get<number>('COLLAB_INTENT_CONFIDENCE_THRESHOLD', 0.85);
  }

  /**
   * 主群召唤漏房 Director 时是否自动 `collaboration.members.add` 入群后再直连回复。默认关闭。
   */
  getCollabSummonAutoJoinMain(): boolean {
    return this.configManager.get<boolean>('COLLAB_SUMMON_AUTO_JOIN_MAIN', false);
  }

  /** 主群一次用户消息最多直连多少位房内 agent（含 summon / audience 解析结果截断）。 */
  getCollabMainRoomMaxDirectTargets(): number {
    const n = this.configManager.get<number>('COLLAB_MAIN_ROOM_MAX_DIRECT_TARGETS', 16);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 16;
    return Math.max(1, Math.min(32, Math.floor(n)));
  }

  /** 阶段 5：主群受众路由允许高相关专员自然接话（默认开）。 */
  isCollabMainRoomAudienceEmployeeNaturalEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_MAIN_ROOM_AUDIENCE_EMPLOYEE_NATURAL_ENABLED', true);
  }

  getCollabMainRoomAudienceEmployeeNaturalMax(): number {
    const n = this.configManager.get<number>('COLLAB_MAIN_ROOM_AUDIENCE_EMPLOYEE_NATURAL_MAX', 2);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 2;
    return Math.max(0, Math.min(8, Math.floor(n)));
  }

  getCollabMainRoomAudienceEmployeeNaturalMinConfidence(): number {
    const n = this.configManager.get<number>('COLLAB_MAIN_ROOM_AUDIENCE_EMPLOYEE_NATURAL_MIN_CONFIDENCE', 0.78);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 0.78;
    return Math.max(0, Math.min(1, n));
  }

  getCollabMainRoomAppendAgentRetryAttempts(): number {
    const n = this.configManager.get<number>('COLLAB_MAIN_ROOM_APPEND_AGENT_RETRY_ATTEMPTS', 3);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 3;
    return Math.max(1, Math.min(5, Math.floor(n)));
  }

  isCollabMainRoomRoundtableEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_MAIN_ROOM_ROUNDTABLE_ENABLED', true);
  }

  getCollabMainRoomRoundtableMaxRounds(): number {
    const n = this.configManager.get<number>('COLLAB_MAIN_ROOM_ROUNDTABLE_MAX_ROUNDS', 4);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 4;
    return Math.max(1, Math.min(12, Math.floor(n)));
  }

  getCollabMainRoomRoundtableRedisTtlMs(): number {
    const n = this.configManager.get<number>('COLLAB_MAIN_ROOM_ROUNDTABLE_REDIS_TTL_MS', 600_000);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 600_000;
    return Math.max(60_000, Math.min(3_600_000, Math.floor(n)));
  }

  isCollabAgentPeerSummonEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_AGENT_PEER_SUMMON_ENABLED', true);
  }

  getCollabAgentPeerSummonMaxPerEvent(): number {
    const n = this.configManager.get<number>('COLLAB_AGENT_PEER_SUMMON_MAX_PER_EVENT', 1);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(4, Math.floor(n)));
  }

  /** 主群多目标直连：并行生成回复的并发上限（落库顺序仍与解析目标顺序一致）。 */
  getCollabMainRoomDirectReplyConcurrency(): number {
    const n = this.configManager.get<number>('COLLAB_MAIN_ROOM_DIRECT_REPLY_CONCURRENCY', 6);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 6;
    return Math.max(1, Math.min(16, Math.floor(n)));
  }

  /** 主群直连 Agent 单次生成的 max_output_tokens（非 fast handover）。 */
  getCollabDirectReplyMaxOutputTokens(): number {
    const n = this.configManager.get<number>('COLLAB_DIRECT_REPLY_MAX_OUTPUT_TOKENS', 2048);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 2048;
    return Math.max(128, Math.min(8192, Math.floor(n)));
  }

  /** 部门群直连 Agent 单次生成的 max_output_tokens。 */
  getCollabDeptDirectReplyMaxOutputTokens(): number {
    const n = this.configManager.get<number>('COLLAB_DEPT_DIRECT_REPLY_MAX_OUTPUT_TOKENS', 4096);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 4096;
    return Math.max(256, Math.min(8192, Math.floor(n)));
  }

  /** 主群 fast handover 直连的 max_output_tokens。 */
  getCollabDirectReplyFastMaxOutputTokens(): number {
    const n = this.configManager.get<number>('COLLAB_DIRECT_REPLY_FAST_MAX_OUTPUT_TOKENS', 512);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 512;
    return Math.max(128, Math.min(2048, Math.floor(n)));
  }

  getCollabDirectReplyLengthContinuationMaxRounds(): number {
    const n = this.configManager.get<number>('COLLAB_DIRECT_REPLY_LENGTH_CONTINUATION_MAX_ROUNDS', 2);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 2;
    return Math.max(0, Math.min(4, Math.floor(n)));
  }

  getCollabDirectReplyVisibleTextHardCap(): number {
    const n = this.configManager.get<number>('COLLAB_DIRECT_REPLY_VISIBLE_TEXT_HARD_CAP', 48_000);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 48_000;
    return Math.max(8000, Math.min(120_000, Math.floor(n)));
  }

  isCollabDirectReplyStreamingEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_DIRECT_REPLY_STREAMING_ENABLED', true);
  }

  isCollabDeptDirectReplyStreamingEnabled(): boolean {
    const dept = this.configManager.get<boolean | undefined>('COLLAB_DEPT_DIRECT_REPLY_STREAMING_ENABLED');
    if (typeof dept === 'boolean') return dept;
    return this.isCollabDirectReplyStreamingEnabled();
  }

  getCollabDirectReplyStreamChunkChars(): number {
    const n = this.configManager.get<number>('COLLAB_DIRECT_REPLY_STREAM_CHUNK_CHARS', 200);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 200;
    return Math.max(48, Math.min(1200, Math.floor(n)));
  }

  isCollabLlmTokenStreamingEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_LLM_TOKEN_STREAMING_ENABLED', true);
  }

  getCollabLlmTokenStreamFlushMs(): number {
    const n = this.configManager.get<number>('COLLAB_LLM_TOKEN_STREAM_FLUSH_MS', 40);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 40;
    return Math.max(8, Math.min(500, Math.floor(n)));
  }

  getCollabLlmTokenStreamMinChars(): number {
    const n = this.configManager.get<number>('COLLAB_LLM_TOKEN_STREAM_MIN_CHARS', 24);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 24;
    return Math.max(1, Math.min(512, Math.floor(n)));
  }

  resolveCollabDirectReplyMaxOutputTokens(params: {
    fast: boolean;
    roomType?: 'main' | 'department';
  }): number {
    if (params.fast) return this.getCollabDirectReplyFastMaxOutputTokens();
    if (params.roomType === 'department') return this.getCollabDeptDirectReplyMaxOutputTokens();
    return this.getCollabDirectReplyMaxOutputTokens();
  }

  isCollabDirectReplyStreamingEnabledForRoom(roomType?: 'main' | 'department'): boolean {
    if (roomType === 'department') return this.isCollabDeptDirectReplyStreamingEnabled();
    return this.isCollabDirectReplyStreamingEnabled();
  }

  /** `audience_resolution` 多目标且未 @ CEO 时，是否从直连列表移除 CEO。 */
  isCollabMainRoomAudienceSummonStripCeoEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_MAIN_ROOM_AUDIENCE_SUMMON_STRIP_CEO', true);
  }

  /** 多目标直连时是否弱化 unified 里服务端写入的「依次介绍」类 userFacingReply。 */
  isCollabMainRoomMultiDirectSanitizeUserFacingEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_MAIN_ROOM_MULTI_DIRECT_SANITIZE_USER_FACING', true);
  }

  isMainRoomIntentDirectorMemoryShadowEnabled(): boolean {
    return this.configManager.get<boolean>('MAIN_ROOM_INTENT_DIRECTOR_MEMORY_SHADOW', false);
  }

  isMainRoomIntentInlineReplyEnabled(): boolean {
    return this.configManager.get<boolean>('MAIN_ROOM_INTENT_INLINE_REPLY_ENABLED', false);
  }

  getMainRoomIntentInlineReplyMinConfidence(): number {
    const n = this.configManager.get<number>('MAIN_ROOM_INTENT_INLINE_REPLY_MIN_CONFIDENCE', 0.88);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 0.88;
    return Math.max(0, Math.min(1, n));
  }

  /** CEO natural_reply 是否拉取主群最近消息节选（指代 / 「刚才说了什么」）。 */
  isCeoReplayInjectRecentTranscriptEnabled(): boolean {
    return this.configManager.get<boolean>('CEO_REPLAY_INJECT_RECENT_TRANSCRIPT', true);
  }

  /**
   * CEO replay 路径组装的「最近对话节选」正文最大字符（`GroupChatContextService.buildCeoReplayRecentTranscriptBlock`）。
   * 默认高于历史硬编码 1400，使委托与 natural_reply 共享更长多轮上下文。
   */
  getCeoReplayRecentTranscriptMaxBodyChars(): number {
    const n = this.configManager.get<number>('CEO_REPLAY_RECENT_TRANSCRIPT_MAX_BODY_CHARS', 4200);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 4200;
    return Math.min(16_000, Math.max(800, Math.floor(n)));
  }

  /**
   * 主群 replay：`assemblePack`/grounding 退缩为极小保底，事实由模型按需调用
   * `memory.search` / `facts.company.query`（与编排 canonical 工具对齐）。**默认开启**（上线产品路径）。
   * 设为 `false` 时回退旧路径：大包预取（Cortex/公司 Memory 预取/四类 facts 预取等），委托无工具轮（仅紧急回滚用）。
   */
  isCeoReplayToolsEnabled(): boolean {
    return this.configManager.get<boolean>('CEO_REPLAY_TOOLS_ENABLED', true);
  }

  /** 主群 CEO Context Grounding Planner（LLM 按需预取块）。默认开启。 */
  isCeoContextGroundingPlannerEnabled(): boolean {
    return this.configManager.get<boolean>('CEO_CONTEXT_GROUNDING_PLANNER_ENABLED', true);
  }

  /**
   * 主群 replay 事实层：`minimal_tools`（默认）或 `full_prefetch`（紧急回滚大包预取）。
   */
  getCeoReplayFactLayerMode(): 'minimal_tools' | 'full_prefetch' {
    const raw = String(this.configManager.get<string>('CEO_REPLAY_FACT_LAYER_MODE', 'minimal_tools') ?? '')
      .trim()
      .toLowerCase();
    return raw === 'full_prefetch' ? 'full_prefetch' : 'minimal_tools';
  }

  /** replay 工具阶段最大轮次（每轮可含多次 tool_call）。默认 3。 */
  getCeoReplayToolsMaxRounds(): number {
    const n = this.configManager.get<number>('CEO_REPLAY_TOOLS_MAX_ROUNDS', 3);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 3;
    return Math.min(8, Math.max(1, Math.floor(n)));
  }

  /** 每轮最多处理的 tool_call 数（与 {@link CeoV2ToolsService} 上限对齐内层）。默认 5。 */
  getCeoReplayToolsMaxCallsPerRound(): number {
    const n = this.configManager.get<number>('CEO_REPLAY_TOOLS_MAX_CALLS_PER_ROUND', 5);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 5;
    return Math.min(5, Math.max(1, Math.floor(n)));
  }

  /**
   * 启用 replay 工具时 LLM 超时：在基础毫秒上乘以倍数并封顶，避免多轮工具拖垮 P95。
   * `CEO_REPLAY_TOOLS_TIMEOUT_MULTIPLIER` 默认 2；`CEO_REPLAY_TOOLS_TIMEOUT_MS_CAP` 默认 45000。
   */
  getCeoReplayToolsAdjustedLlmTimeoutMs(baseMs: number): number {
    if (!this.isCeoReplayToolsEnabled()) return baseMs;
    const multRaw = this.configManager.get<number>('CEO_REPLAY_TOOLS_TIMEOUT_MULTIPLIER', 2);
    const mult = typeof multRaw === 'number' && Number.isFinite(multRaw) ? Math.max(1, multRaw) : 2;
    const capRaw = this.configManager.get<number>('CEO_REPLAY_TOOLS_TIMEOUT_MS_CAP', 45_000);
    const cap = typeof capRaw === 'number' && Number.isFinite(capRaw) ? Math.max(10_000, capRaw) : 45_000;
    return Math.min(cap, Math.floor(baseMs * mult));
  }

  /** 主群 IntentLayer userTurn 是否附带最近对话节选（多轮指代）。 */
  isMainRoomIntentInjectRecentTranscriptEnabled(): boolean {
    return this.configManager.get<boolean>('MAIN_ROOM_INTENT_INJECT_RECENT_TRANSCRIPT', true);
  }

  /**
   * 是否在治理入口向用户展示 `governanceAck` 前缀。默认关闭（PR2 自然口吻）。
   */
  getCollabGovernanceAckVisible(): boolean {
    return this.configManager.get<boolean>('COLLAB_GOVERNANCE_ACK_VISIBLE', false);
  }

  /** 部门群是否启用 Director 真实模型回复（Intent + directed LLM）。默认关闭。 */
  getCollabDeptDirectorModelEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_DEPT_DIRECTOR_MODEL_ENABLED', false);
  }

  /** Phase 3.5：`direct_agent` 单目标 + 职务启发式命中时的快速 handover（默认开启）。 */
  isDirectAgentFastHandoverEnabled(): boolean {
    return this.configManager.get<boolean>('DIRECT_AGENT_FAST_HANDOVER_ENABLED', true);
  }

  /** 主群直聊是否暴露 Agent 绑定 Skill 为 LLM tools（默认开启）。 */
  isDirectAgentSkillsEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_DIRECT_AGENT_SKILLS_ENABLED', true);
  }

  getDirectAgentSkillsMaxRounds(fast: boolean): number {
    const key = fast ? 'COLLAB_DIRECT_AGENT_SKILLS_FAST_MAX_ROUNDS' : 'COLLAB_DIRECT_AGENT_SKILLS_MAX_ROUNDS';
    const fallback = fast ? 2 : 3;
    const n = this.configManager.get<number>(key, fallback);
    if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
    return Math.min(8, Math.max(1, Math.floor(n)));
  }

  getDirectAgentSkillsMaxCallsPerRound(fast: boolean): number {
    const key = fast
      ? 'COLLAB_DIRECT_AGENT_SKILLS_FAST_MAX_CALLS_PER_ROUND'
      : 'COLLAB_DIRECT_AGENT_SKILLS_MAX_CALLS_PER_ROUND';
    const fallback = fast ? 2 : 4;
    const n = this.configManager.get<number>(key, fallback);
    if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
    return Math.min(8, Math.max(1, Math.floor(n)));
  }

  /**
   * 直聊 prompt Skill 展开：显式配置优先；否则 fast→auto（轻量），非 fast→complete（一次产出更可读）。
   */
  getDirectAgentSkillsPromptMode(fast: boolean): 'auto' | 'complete' {
    const raw = String(this.configManager.get<string>('COLLAB_DIRECT_AGENT_SKILLS_PROMPT_MODE', '') ?? '').trim();
    if (raw === 'auto' || raw === 'complete') return raw;
    return fast ? 'auto' : 'complete';
  }

  /** Phase 2：`tool.ask_colleague` 同步跨 Agent 工具开关（默认关闭）。 */
  isAskColleagueToolEnabled(): boolean {
    return this.configManager.get<boolean>('ASK_COLLEAGUE_TOOL_ENABLED', false);
  }

  /** `tool.ask_colleague` 最大递归深度（默认 2）。 */
  getAskColleagueMaxDepth(): number {
    const n = this.configManager.get<number>('ASK_COLLEAGUE_MAX_DEPTH', 2);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 2;
    return Math.min(5, Math.max(1, Math.floor(n)));
  }

  /** `tool.ask_colleague` 顶层超时毫秒（默认 45s）。 */
  getAskColleagueTimeoutMs(): number {
    const n = this.configManager.get<number>('ASK_COLLEAGUE_TIMEOUT_MS', 45_000);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 45_000;
    return Math.min(120_000, Math.max(5_000, Math.floor(n)));
  }

  /** 审批收窄策略：`normal`（默认）或 `strict`（更接近旧版宽门禁）。 */
  isCollabLlmMeteringEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_LLM_METERING_ENABLED', true);
  }

  /** W4：协作 Memory session/dept/company 分层（默认开启）。 */
  isCollabMemoryLayeringEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_MEMORY_LAYERING_ENABLED', true);
  }

  /** Phase 3.6：主群单 trace Memory Graph lead 检索结果进程内复用（默认开启）。 */
  isMemoryRetrievalDeduplicationEnabled(): boolean {
    return this.configManager.get<boolean>('MEMORY_RETRIEVAL_DEDUPLICATION_ENABLED', true);
  }

  /**
   * CEO L1 战略层记忆：
   * - `reuse_lead`：仅 lead，不再搜 L1；
   * - `reuse_lead_l1_if_empty`（默认）：lead 有命中则不再搜 L1，否则搜 L1；
   * - `reuse_lead_and_l1`：lead + L1 合并去重（延迟更高）。
   */
  getCeoStrategyLayerMemoryMode(): 'reuse_lead' | 'reuse_lead_l1_if_empty' | 'reuse_lead_and_l1' {
    const raw = String(this.configManager.get<string>('CEO_STRATEGY_LAYER_MEMORY_MODE', '') ?? '')
      .trim()
      .toLowerCase();
    if (raw === 'reuse_lead') return 'reuse_lead';
    if (raw === 'reuse_lead_and_l1') return 'reuse_lead_and_l1';
    return 'reuse_lead_l1_if_empty';
  }

  /** Phase 3.6：lead 检索跨进程 Redis 缓存（默认开启；无 REDIS_URL 时等效关闭）。 */
  isMemoryRetrievalLeadRedisCacheEnabled(): boolean {
    return this.configManager.get<boolean>('MEMORY_RETRIEVAL_LEAD_REDIS_CACHE_ENABLED', true);
  }

  /** Phase 3.6：Redis lead 缓存 TTL（毫秒）。 */
  getMemoryRetrievalLeadRedisTtlMs(): number {
    return this.configManager.get<number>('MEMORY_RETRIEVAL_LEAD_REDIS_TTL_MS', 30_000);
  }

  /** P0：主群已移除强制画像问卷拼接；本开关仍用于 quick 编排策略与 auxiliary hint；默认开启。 */
  isCollabProfileFollowupSuppressQuick(): boolean {
    return this.configManager.get<boolean>('COLLAB_PROFILE_FOLLOWUP_SUPPRESS_QUICK', true);
  }

  getCollabApprovalStrictLevel(): 'normal' | 'strict' {
    const raw = String(this.configManager.get<string>('COLLAB_APPROVAL_STRICT_LEVEL', 'normal') ?? 'normal')
      .trim()
      .toLowerCase();
    return raw === 'strict' ? 'strict' : 'normal';
  }

  /**
   * Intent 2026.1 planning enrichment（`pipelineL1PlanningCard` / metadata）全局开关；默认开启。
   * 公司级覆盖：`runtime_preferences.collaboration.intent20261PlanningEnrichEnabled`。
   */
  isCollabIntent20261ForceEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_INTENT_2026_1_FORCE_ENABLED', true);
  }

  /** L1 Strategy model; defaults to decision model when empty. */
  getCeoStrategyModel(): string {
    const direct = (this.configManager.get<string>('CEO_STRATEGY_MODEL', '') ?? '').trim();
    if (direct) return direct;
    return this.getCeoDecisionModel();
  }

  getCeoOrchestrationModel(): string {
    const direct = (this.configManager.get<string>('CEO_ORCHESTRATION_MODEL', '') ?? '').trim();
    if (direct) return direct;
    const strategy = (this.configManager.get<string>('CEO_STRATEGY_MODEL', '') ?? '').trim();
    if (strategy) return strategy;
    const supervision = (this.configManager.get<string>('CEO_SUPERVISION_MODEL', '') ?? '').trim();
    if (supervision) return supervision;
    return (this.configManager.get<string>('CEO_DECISION_MODEL', '') ?? '').trim();
  }

  getCeoSupervisionModel(): string {
    const direct = (this.configManager.get<string>('CEO_SUPERVISION_MODEL', '') ?? '').trim();
    if (direct) return direct;
    const fallback = (this.configManager.get<string>('CEO_SUPERVISION_LLM_MODEL', '') ?? '').trim();
    return fallback || this.getCeoOrchestrationModel();
  }

  /** Strategy classifier uses decision model config. */
  getCeoDecisionModel(): string {
    const direct = (this.configManager.get<string>('CEO_DECISION_MODEL', '') ?? '').trim();
    if (direct) return direct;
    // Decision/classifier model must be chat-capable; do not implicitly reuse intent model,
    // because some deployments bind COLLAB_INTENT_MODEL to embedding models.
    return this.getCeoOrchestrationModel();
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

  /**
   * CEO v2 Strategy `plan()` 结构化产出（goal + 3–5 OKRs + resource/timeline 等）。
   * 默认 4096：避免中文长句 OKR 在 max_tokens=1500 时被截断导致 JSON 不完整。
   * 环境变量：`CEO_V2_PLANNING_MAX_OUTPUT_TOKENS`（512–32768）。
   */
  getCeoV2PlanningMaxOutputTokens(): number {
    const raw = this.configManager.get<number | string | undefined>('CEO_V2_PLANNING_MAX_OUTPUT_TOKENS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 512 && n <= 32_768) {
      return Math.floor(n);
    }
    return 4096;
  }

  /**
   * CEO v2 契约发射专用：`contextPack` → 结构化 Planning JSON。与取证轮分离，默认更大 `max_tokens`，
   * 避免 json_mode 下长中文 JSON 在输出侧被截断。环境变量：`CEO_V2_PLANNING_CONTRACT_MAX_OUTPUT_TOKENS`（1024–32768）。
   * 默认 16384（较 8192 更不易截断 verbose 中文 phase 文本）。
   */
  getCeoV2PlanningContractMaxOutputTokens(): number {
    const raw = this.configManager.get<number | string | undefined>('CEO_V2_PLANNING_CONTRACT_MAX_OUTPUT_TOKENS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 1024 && n <= 32_768) {
      return Math.floor(n);
    }
    return 16_384;
  }

  /**
   * 契约通道：校验失败后追加给模型的修复轮数上限（不含首次发射）。默认 2（最多 1+2 次 structured 调用）。
   * 环境变量：`CEO_V2_PLANNING_CONTRACT_MAX_REPAIR_ATTEMPTS`（0–8）。
   */
  getCeoV2PlanningContractMaxRepairAttempts(): number {
    const raw = this.configManager.get<number | string | undefined>('CEO_V2_PLANNING_CONTRACT_MAX_REPAIR_ATTEMPTS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 0 && n <= 8) {
      return Math.floor(n);
    }
    return 2;
  }

  /**
   * 契约修复 HumanMessage 中 `priorRawText` 最大字符数（避免上下文膨胀）。默认 8000。
   * 环境变量：`CEO_V2_PLANNING_CONTRACT_REPAIR_PRIOR_RAW_TEXT_MAX_CHARS`（1000–16000）。
   */
  getCeoV2PlanningContractRepairPriorRawTextMaxChars(): number {
    const raw = this.configManager.get<number | string | undefined>(
      'CEO_V2_PLANNING_CONTRACT_REPAIR_PRIOR_RAW_TEXT_MAX_CHARS',
    );
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 1000 && n <= 16_000) {
      return Math.floor(n);
    }
    return 8000;
  }

  /**
   * 契约通道：`withStructuredOutput` 连续解析失败后，是否再尝试一次裸 `invoke` + `parseJsonSafe` + Zod。
   * 默认开启；`CEO_V2_PLANNING_CONTRACT_PLAIN_JSON_FALLBACK_ENABLED=false` 关闭。
   */
  isCeoV2PlanningContractPlainJsonFallbackEnabled(): boolean {
    const raw = this.configManager.get<boolean | string | undefined>(
      'CEO_V2_PLANNING_CONTRACT_PLAIN_JSON_FALLBACK_ENABLED',
    );
    if (raw === false || raw === 'false' || raw === '0') return false;
    if (raw === true || raw === 'true' || raw === '1') return true;
    return true;
  }

  /**
   * 裸 JSON 兜底轮中要求每个 `strategicPhases[].outcome` 的最大字符数（须 ≤ Zod schema 的 560）。
   * 环境变量：`CEO_V2_PLANNING_CONTRACT_PLAIN_JSON_OUTCOME_MAX_CHARS`（80–560），默认 260。
   */
  getCeoV2PlanningContractPlainJsonOutcomeMaxChars(): number {
    const raw = this.configManager.get<number | string | undefined>(
      'CEO_V2_PLANNING_CONTRACT_PLAIN_JSON_OUTCOME_MAX_CHARS',
    );
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 80 && n <= 560) {
      return Math.floor(n);
    }
    return 260;
  }

  /**
   * 裸 JSON 兜底：最多几次 `invoke`（含首轮）。默认 2（首轮 + 一轮按校验 issues 的极简重试）。
   * 环境变量：`CEO_V2_PLANNING_CONTRACT_PLAIN_JSON_MAX_ATTEMPTS`（1–3）。
   */
  getCeoV2PlanningContractPlainJsonMaxAttempts(): number {
    const raw = this.configManager.get<number | string | undefined>(
      'CEO_V2_PLANNING_CONTRACT_PLAIN_JSON_MAX_ATTEMPTS',
    );
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 1 && n <= 3) {
      return Math.floor(n);
    }
    return 2;
  }

  /**
   * Strategy 规划 LLM 超时（含多轮 tool + 结构化 JSON）。默认 90s。
   * 环境变量：`CEO_V2_PLANNING_LLM_TIMEOUT_MS`（≥5000）。
   */
  getCeoV2PlanningLlmTimeoutMs(): number {
    const raw = this.configManager.get<number | string | undefined>('CEO_V2_PLANNING_LLM_TIMEOUT_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && !Number.isNaN(n) && n >= 5000) {
      return Math.floor(n);
    }
    return 90_000;
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

  /** L1 Human：辅助上下文（身份/向量摘要）最大字符数；0 表示不注入 */
  getCollabClassifierContextMaxChars(): number {
    return this.configManager.get<number>('WORKER_COLLAB_CLASSIFIER_CONTEXT_MAX_CHARS', 1200);
  }

  /** 房间内 Agent roster 简要 JSON 的进程内缓存 TTL；0 关闭 */
  getCollabRosterCacheTtlMs(): number {
    return this.configManager.get<number>('WORKER_COLLAB_ROSTER_CACHE_TTL_MS', 60_000);
  }

  /** L1 分类 JSON 决策进程内缓存 TTL；0 关闭 */
  getCollabL1ClassifierCacheTtlMs(): number {
    return this.configManager.get<number>('WORKER_COLLAB_L1_CLASSIFIER_CACHE_TTL_MS', 0);
  }

  /** L1 重构总开关（默认开启；可被公司级配置覆盖） */
  isWorkerL1RefactorEnabled(): boolean {
    return this.configManager.get<boolean>('WORKER_L1_REFACTOR_ENABLED', true);
  }

  /** L1 Classifier Prompt 版本（默认 v2.1-exact） */
  getL1PromptVersion(): 'v2.1-exact' | 'v2.1-creative' {
    const raw = (this.configManager.get<string>('L1_PROMPT_VERSION', 'v2.1-exact') ?? '').trim();
    return raw === 'v2.1-creative' ? 'v2.1-creative' : 'v2.1-exact';
  }

  /** L1 Predictive MoE 开关（默认关闭；可被公司级配置覆盖） */
  isL1PredictiveMoeEnabled(): boolean {
    return this.configManager.get<boolean>('L1_PREDICTIVE_MOE_ENABLED', false);
  }

  isMultiAgentGraphV2Enabled(): boolean {
    return this.boolFromMainChainOverlay('MULTI_AGENT_GRAPH_V2_ENABLED', 'MULTI_AGENT_GRAPH_V2_ENABLED', false);
  }

  /** Phase 3.5：CEO 自治图 Layer1(plan) 后 Early-Exit */
  isCeoEarlyExitEnabled(): boolean {
    return this.configManager.get<boolean>('CEO_EARLY_EXIT_ENABLED', true);
  }

  /** 协作主群 CEO **replay** 进程级开关：`CEO_REPLAY_ENABLED` → `CEO_USER_SURFACE_ENABLED` → `CEO_EARLY_EXIT_ENABLED`。 */
  isCeoReplayCollaborationEnabled(): boolean {
    const r = this.configManager.get<boolean>('CEO_REPLAY_ENABLED');
    if (typeof r === 'boolean') return r;
    const u = this.configManager.get<boolean>('CEO_USER_SURFACE_ENABLED');
    if (typeof u === 'boolean') return u;
    return this.isCeoEarlyExitEnabled();
  }

  getEarlyExitConfidenceThreshold(): number {
    const n = this.configManager.get<number>('EARLY_EXIT_CONFIDENCE_THRESHOLD', 0.92);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 0.92;
    return Math.max(0, Math.min(1, n));
  }

  /** replay 记忆置信阈值：`CEO_REPLAY_MEMORY_THRESHOLD` → `CEO_USER_SURFACE_MEMORY_THRESHOLD` → {@link getEarlyExitConfidenceThreshold}。 */
  getCeoReplayMemoryConfidenceThreshold(): number {
    const r = this.configManager.get<number>('CEO_REPLAY_MEMORY_THRESHOLD');
    if (typeof r === 'number' && Number.isFinite(r)) return Math.max(0, Math.min(1, r));
    const u = this.configManager.get<number>('CEO_USER_SURFACE_MEMORY_THRESHOLD');
    if (typeof u === 'number' && Number.isFinite(u)) return Math.max(0, Math.min(1, u));
    return this.getEarlyExitConfidenceThreshold();
  }

  /** 主群 CEO natural replay 默认模型（平台/公司 `contextPolicy.replay.modelName` 可覆盖）。 */
  getCeoReplayModelName(): string {
    const s = String(this.configManager.get<string>('CEO_REPLAY_MODEL_NAME', 'glm-4-flash') ?? '').trim();
    return s || 'glm-4-flash';
  }

  isCollabCeoDispatchPlanV2Enabled(): boolean {
    return this.boolFromMainChainOverlay(
      'COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED',
      'COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED',
      true,
    );
  }

  /** 主群 Dispatch Plan 路径是否应激活。 */
  shouldUseCeoDispatchPlanPath(): boolean {
    return this.isCollabCeoDispatchPlanV2Enabled();
  }

  isCollabProgramSsotEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_PROGRAM_SSOT_ENABLED', true);
  }

  getCollabProgramConfirmMode(): 'auto' | 'always' {
    const raw = String(this.configManager.get<string>('COLLAB_PROGRAM_CONFIRM_MODE', 'auto') ?? 'auto').trim();
    return raw === 'always' ? 'always' : 'auto';
  }

  isCollabProgramLegacyRouterFallbackEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_PROGRAM_LEGACY_ROUTER_FALLBACK', false);
  }

  isCollabTurnToolOrchestrationEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_TURN_TOOL_ORCHESTRATION_ENABLED', true);
  }

  /** Phase 1：Agent 工具循环（替代 replay delegate → authorization → dispatch 流程）。 */
  isCollabAgentToolLoopEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_AGENT_TOOL_LOOP_ENABLED', true);
  }

  /** UUID thread 读 Redis 会话时不回退 main（E2E / 生产建议开启）。 */
  isCollabStrictThreadIsolationEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_STRICT_THREAD_ISOLATION', true);
  }

  /** Dispatch Plan 编译成功后的下发门闸（默认 auto）。 */
  getCollabDispatchConfirmMode(): 'auto' | 'confirm' {
    const overlay = this.mainChainOverlay()?.getDispatchConfirmMode();
    if (overlay) return overlay;
    const raw = String(this.configManager.get<string>('COLLAB_DISPATCH_CONFIRM_MODE', 'auto') ?? 'auto').trim();
    return raw === 'confirm' ? 'confirm' : 'auto';
  }

  /** 主群监督是否强制内联（默认 true，见 ADR ceo-v2-supervision-execution-path）。 */
  isCollabMainRoomForceInlineSupervision(): boolean {
    return this.configManager.get<boolean>('COLLAB_MAIN_ROOM_FORCE_INLINE_SUPERVISION', true);
  }

  isMainRoomDispatchChatMessagesEnabled(): boolean {
    return this.configManager.get<boolean>('MAIN_ROOM_DISPATCH_CHAT_MESSAGES_ENABLED', true);
  }

  isMainRoomDeptProgressRelayEnabled(): boolean {
    return this.configManager.get<boolean>('MAIN_ROOM_DEPT_PROGRESS_RELAY_ENABLED', true);
  }

  isMainRoomDispatchRespectDependencies(): boolean {
    return this.boolFromMainChainOverlay(
      'MAIN_ROOM_DISPATCH_RESPECT_DEPENDENCIES',
      'MAIN_ROOM_DISPATCH_RESPECT_DEPENDENCIES',
      true,
    );
  }

  isMainRoomDistributionCompletionSummaryEnabled(): boolean {
    return this.boolFromMainChainOverlay(
      'MAIN_ROOM_DISTRIBUTION_COMPLETION_SUMMARY_ENABLED',
      'MAIN_ROOM_DISTRIBUTION_COMPLETION_SUMMARY_ENABLED',
      false,
    );
  }

  getCollabSupervisionInputMode(): 'dept_reports' | 'inline_skill' {
    const overlay = this.mainChainOverlay()?.getSupervisionInputMode();
    const raw = overlay
      ?? String(this.configManager.get<string>('COLLAB_SUPERVISION_INPUT_MODE', 'inline_skill')).trim();
    if (raw === 'dept_reports') {
      if (
        this.isDirectorAutonomousEnabled() &&
        this.isEmployeeAutonomousEnabled() &&
        this.isMultiAgentGraphV2Enabled()
      ) {
        return 'dept_reports';
      }
      return 'inline_skill';
    }
    return 'inline_skill';
  }

  /** L2 子目标自动结案前是否要求部门汇报携带可验收交付物。 */
  isCollabL2AutoCompleteRequireDeliverable(): boolean {
    return this.boolFromMainChainOverlay(
      'COLLAB_L2_AUTO_COMPLETE_REQUIRE_DELIVERABLE',
      'COLLAB_L2_AUTO_COMPLETE_REQUIRE_DELIVERABLE',
      true,
    );
  }

  /** L2 子目标结案前是否要求收齐全部委派员工汇报（防竞态提前结案）。默认开，异常可关回旧行为。 */
  isCollabL2RequireAllDelegations(): boolean {
    return this.boolFromMainChainOverlay(
      'COLLAB_L2_REQUIRE_ALL_DELEGATIONS',
      'COLLAB_L2_REQUIRE_ALL_DELEGATIONS',
      true,
    );
  }

  /** 部门群对话模式：默认不向聊天写入系统镜像类消息。 */
  isCollabDeptChatConversationalMode(): boolean {
    return this.configManager.get<boolean>('COLLAB_DEPT_CHAT_CONVERSATIONAL_MODE', true);
  }

  private resolveDeptChatFlag(envKey: string, legacyDefault: boolean): boolean {
    const raw = this.configManager.get<boolean | undefined>(envKey, undefined);
    if (raw !== undefined) return raw;
    if (this.isCollabDeptChatConversationalMode()) return false;
    return legacyDefault;
  }

  isCollabDeptTaskStageChatEnabled(): boolean {
    return this.resolveDeptChatFlag('COLLAB_DEPT_TASK_STAGE_CHAT_ENABLED', true);
  }

  isCollabDeptSkillToolCallChatEnabled(): boolean {
    return this.resolveDeptChatFlag('COLLAB_DEPT_SKILL_TOOL_CALL_CHAT_ENABLED', true);
  }

  isCollabDeptSupervisionReportInRoomEnabled(): boolean {
    return this.resolveDeptChatFlag('COLLAB_DEPT_SUPERVISION_REPORT_IN_ROOM_ENABLED', true);
  }

  isCollabDeptDispatchSystemCardEnabled(): boolean {
    return this.resolveDeptChatFlag('COLLAB_DEPT_DISPATCH_SYSTEM_CARD_ENABLED', true);
  }

  isCollabDeptEmployeeCollabAckChatEnabled(): boolean {
    return this.resolveDeptChatFlag('COLLAB_DEPT_EMPLOYEE_COLLAB_ACK_CHAT_ENABLED', true);
  }

  isMainRoomReplayPatchStrategyDraftFromSummaryEnabled(): boolean {
    return this.configManager.get<boolean>('MAIN_ROOM_REPLAY_PATCH_STRATEGY_DRAFT_FROM_SUMMARY_ENABLED', false);
  }

  /** 阶段 4：主群编排暂停/撤回快捷操作与门控。 */
  isCollabMainRoomOrchestrationPauseEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_MAIN_ROOM_ORCHESTRATION_PAUSE_ENABLED', true);
  }

  /** 主群 Replay 执行模式轻答优先 natural_reply。 */
  isCollabMainRoomReplayNaturalLightReplyEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_MAIN_ROOM_REPLAY_NATURAL_LIGHT_REPLY', false);
  }

  /** 阶段 2：主群先即时接话、后跑重编排（默认开）。 */
  isCollabMainRoomReplyBeforeHeavyEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_MAIN_ROOM_REPLY_BEFORE_HEAVY', true);
  }

  /** 阶段 3：主群 `resolveMainRoomRoute` SSOT 收敛（earlyRoute 统一分发，默认开）。 */
  isCollabMainRoomRouteSsotConvergedEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_MAIN_ROOM_ROUTE_SSOT_CONVERGED', true);
  }

  /** Phase 12：Work Intent Compiler 多信号融合终裁（默认开）。 */
  isCollabWorkIntentCompilerEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_WORK_INTENT_COMPILER_ENABLED', true);
  }

  /** Phase 13：Program timeline（Redis SSOT，可观测/进度面板用）。 */
  isCollabProgramTimelineEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_PROGRAM_TIMELINE_ENABLED', true);
  }

  /** Phase 15：Program 为 SSOT 时停止双写 legacy alignment/draft session（只读 fallback）。 */
  isCollabProgramSessionProjectionOnly(): boolean {
    return this.configManager.get<boolean>('COLLAB_PROGRAM_SESSION_PROJECTION_ONLY', false);
  }

  /** Phase 2：主群 Replay SSOT 事件驱动 API ReplayDecision。 */
  isCollabMainRoomReplaySsotPhase2Enabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_MAIN_ROOM_REPLAY_SSOT_PHASE2', true);
  }

  /** 统一 CEO 回合 Redis 状态（draft/alignment）。 */
  isCollabCeoTurnStateUnifiedEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_CEO_TURN_STATE_UNIFIED', false);
  }

  /** unified 开启时是否继续双写 legacy session keys（迁移窗口）。 */
  isCollabCeoTurnStateLegacyDualWriteEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_CEO_TURN_STATE_LEGACY_DUAL_WRITE', true);
  }

  getStrategyPlanningProfileMode(): 'unified' | 'deliverable_bias' {
    const raw = String(this.configManager.get<string>('STRATEGY_PLANNING_PROFILE_MODE', 'unified') ?? 'unified')
      .trim()
      .toLowerCase();
    return raw === 'deliverable_bias' ? 'deliverable_bias' : 'unified';
  }

  isCollabSessionLeaseEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_SESSION_LEASE_ENABLED', true);
  }

  getCollabSessionLeaseTtlMs(): number {
    const n = this.configManager.get<number>('COLLAB_SESSION_LEASE_TTL_MS', 240_000);
    return typeof n === 'number' && Number.isFinite(n) ? Math.min(900_000, Math.max(5000, Math.floor(n))) : 240_000;
  }

  isCollabIntentSinglePublishV20261Enabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_INTENT_SINGLE_PUBLISH_V20261', false);
  }

  isCollabRetrievalPlannerV2Enabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_RETRIEVAL_PLANNER_V2_ENABLED', true);
  }

  isCollabAssignmentValidatorEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_ASSIGNMENT_VALIDATOR_ENABLED', true);
  }

  getCollabOrgSnapshotRoomContextCacheTtlMs(): number {
    const n = this.configManager.get<number>('COLLAB_ORG_SNAPSHOT_ROOM_CONTEXT_CACHE_TTL_MS', 12_000);
    return typeof n === 'number' && Number.isFinite(n) ? Math.min(120_000, Math.max(0, Math.floor(n))) : 12_000;
  }

  getCollabDistributeToolsEnforceMode(): 'off' | 'warn' | 'fail' {
    const v = String(this.configManager.get<string>('COLLAB_DISTRIBUTE_TOOLS_ENFORCE_MODE', 'warn') ?? 'warn')
      .trim()
      .toLowerCase();
    if (v === 'off' || v === 'fail') return v;
    return 'warn';
  }

  isCollabCeoRespectsAgentFixedLlmKey(): boolean {
    return this.configManager.get<boolean>('COLLAB_CEO_RESPECTS_AGENT_FIXED_LLM_KEY', true);
  }

  isCollabSupervisionSplitEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_SUPERVISION_SPLIT_ENABLED', false);
  }

  getCeoOrchestrationDistributeLlmTimeoutMs(): number | undefined {
    const raw = this.configManager.get<number | string | undefined>('CEO_ORCHESTRATION_DISTRIBUTE_LLM_TIMEOUT_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n !== 'number' || Number.isNaN(n)) return undefined;
    return Math.min(300_000, Math.max(5000, Math.floor(n)));
  }

  getCeoOrchestrationDistributeMaxOutputTokens(): number | undefined {
    const raw = this.configManager.get<number | string | undefined>('CEO_ORCHESTRATION_DISTRIBUTE_MAX_OUTPUT_TOKENS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n !== 'number' || Number.isNaN(n)) return undefined;
    return Math.min(8192, Math.max(256, Math.floor(n)));
  }

  getCollabSupervisionConversationalProfile(): 'short_confirm' | 'memory_cortex_summary' {
    const v = String(
      this.configManager.get<string>('COLLAB_SUPERVISION_CONVERSATIONAL_PROFILE', 'short_confirm') ?? 'short_confirm',
    )
      .trim()
      .toLowerCase();
    return v === 'memory_cortex_summary' ? 'memory_cortex_summary' : 'short_confirm';
  }

  /**
   * L2 可指派部门池策略：`org_only`（默认，全量组织 slug）或 `intent_filter`（意图 slug 在组织内有效时收窄为子集）。
   * 环境变量：`COLLAB_ASSIGNABLE_DEPARTMENT_POLICY`。
   */
  getCollabAssignableDepartmentPolicy(): 'org_only' | 'intent_filter' {
    const v = String(this.configManager.get<string>('COLLAB_ASSIGNABLE_DEPARTMENT_POLICY', 'org_only') ?? '')
      .trim()
      .toLowerCase();
    if (v === 'intent_filter') return 'intent_filter';
    return 'org_only';
  }

  /** W11：跨部门 L2 协调总开关（进程级） */
  isCrossDepartmentCoordinationEnabled(): boolean {
    return this.configManager.get<boolean>('CROSS_DEPARTMENT_COORDINATION_ENABLED', false);
  }

  /** W7：部门 Director 自主 */
  isDirectorAutonomousEnabled(): boolean {
    return this.boolFromMainChainOverlay('DIRECTOR_AUTONOMOUS_ENABLED', 'DIRECTOR_AUTONOMOUS_ENABLED', false);
  }

  /** W7：员工 Agent 自主提议子任务 */
  isEmployeeAutonomousEnabled(): boolean {
    return this.boolFromMainChainOverlay('EMPLOYEE_AUTONOMOUS_ENABLED', 'EMPLOYEE_AUTONOMOUS_ENABLED', false);
  }

  /** W7：领域事件总线 V2（出站双写） */
  isAutonomousEventBusV2Enabled(): boolean {
    return this.configManager.get<boolean>('AUTONOMOUS_EVENT_BUS_V2_ENABLED', false);
  }

  /** W14：成本感知路由总开关（默认关闭） */
  isCostAwareRoutingEnabled(): boolean {
    return this.configManager.get<boolean>('COST_AWARE_ROUTING_ENABLED', false);
  }

  /** W14：预算利用率阈值（0–1），超过后更激进地选择 `low` priority */
  getCostAwareBudgetThreshold(): number {
    const n = this.configManager.get<number>('COST_AWARE_BUDGET_THRESHOLD', 0.82);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 0.82;
    return Math.min(1, Math.max(0, n));
  }

  getCostAwareRolloutPercent(): number {
    const n = this.configManager.get<number>('COST_AWARE_ROLLOUT_PERCENT', 0);
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.floor(n))) : 0;
  }

  getCostAwareRolloutWhitelistCompanyIds(): string[] {
    const raw = this.configManager.get<string>('COST_AWARE_ROLLOUT_WHITELIST_COMPANY_IDS', '') ?? '';
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** W8：Phase1 统一灰度（Director / Employee / EventBus / GraphV2 等继承路径） */
  getPhase1RolloutPercent(): number {
    const n = this.configManager.get<number>('PHASE1_ROLLOUT_PERCENT', 10);
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.floor(n))) : 10;
  }

  /** W8：Phase1 灰度白名单 companyId（逗号分隔） */
  getPhase1RolloutWhitelistCompanyIds(): string[] {
    const raw = this.configManager.get<string>('PHASE1_ROLLOUT_WHITELIST_COMPANY_IDS', '') ?? '';
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** W12：Phase2 自主观测灰度百分比（0–100） */
  getPhase2RolloutPercent(): number {
    const n = this.configManager.get<number>('PHASE2_ROLLOUT_PERCENT', 0);
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.floor(n))) : 0;
  }

  getPhase2RolloutWhitelistCompanyIds(): string[] {
    const raw = this.configManager.get<string>('PHASE2_ROLLOUT_WHITELIST_COMPANY_IDS', '') ?? '';
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** W16：Phase3 全量渐进总闸（默认关闭） */
  isPhase3RolloutEnabled(): boolean {
    return this.configManager.get<boolean>('PHASE3_ROLLOUT_ENABLED', false);
  }

  getPhase3RolloutPercent(): number {
    const n = this.configManager.get<number>('PHASE3_ROLLOUT_PERCENT', 0);
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.floor(n))) : 0;
  }

  getPhase3RolloutWhitelistCompanyIds(): string[] {
    const raw = this.configManager.get<string>('PHASE3_ROLLOUT_WHITELIST_COMPANY_IDS', '') ?? '';
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** W13：与 API `MEMORY_GRAPH_V2_*` 对齐；Worker 侧用于 consolidation 门控（公司级以 API RPC 为准） */
  isMemoryGraphV2Enabled(): boolean {
    return this.configManager.get<boolean>('MEMORY_GRAPH_V2_ENABLED', false);
  }

  getMemoryGraphV2RolloutPercent(): number {
    const n = this.configManager.get<number>('MEMORY_GRAPH_V2_ROLLOUT_PERCENT', 100);
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.floor(n))) : 100;
  }

  getMemoryGraphV2RolloutWhitelistCompanyIds(): string[] {
    const raw = this.configManager.get<string>('MEMORY_GRAPH_V2_ROLLOUT_WHITELIST_COMPANY_IDS', '') ?? '';
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** Phase3-final：`simple_query` 编排仅 Memory Cortex 工具面（默认开）。 */
  isForceMemoryCortexOnly(): boolean {
    return this.configManager.get<boolean>('FORCE_MEMORY_CORTEX_ONLY', true);
  }

  /** L1 PreContext 开关（默认关闭；可被公司级配置覆盖） */
  isL1PreContextEnabled(): boolean {
    return this.configManager.get<boolean>('L1_PRECONTEXT_ENABLED', false);
  }

  /** L1 Temporal 预热开关（默认关闭；可被公司级配置覆盖） */
  isL1TemporalPrewarmEnabled(): boolean {
    return this.configManager.get<boolean>('L1_TEMPORAL_PREWARM_ENABLED', false);
  }

  /** L3 Temporal 重构 Step 1: 协议对齐（默认关闭；保留旧调用路径） */
  isWorkerL3TemporalProtocolAlignEnabled(): boolean {
    return this.configManager.get<boolean>('WORKER_L3_TEMPORAL_PROTOCOL_ALIGN_ENABLED', false);
  }

  /** L3 Temporal 重构 Step 2: Durable Execution 底座（默认关闭） */
  isWorkerL3TemporalV1Enabled(): boolean {
    return this.configManager.get<boolean>('WORKER_L3_TEMPORAL_V1', false);
  }

  /** L3 Temporal 重构 Step 7: 灰度发布百分比（0-100） */
  getL3TemporalRolloutPercentage(): number {
    const n = this.configManager.get<number>('L3_TEMPORAL_ROLLOUT_PERCENTAGE', 0);
    return Math.max(0, Math.min(100, Math.floor(Number.isFinite(n) ? n : 0)));
  }

  /**
   * 重意图（heavy / multi_dept / 并行执行）在 L3 rollout 为 0 且未白名单时，是否仍默认走 Temporal（需 `WORKER_L3_TEMPORAL_*` 已启用）。
   * 环境变量：`COLLAB_CEO_V2_HEAVY_DEFAULT_TEMPORAL`（默认 false）。
   */
  isCollabCeoV2HeavyDefaultTemporal(): boolean {
    return this.configManager.get<boolean>('COLLAB_CEO_V2_HEAVY_DEFAULT_TEMPORAL', false);
  }

  /** L3 Temporal 重构 Step 7: 白名单公司 */
  getL3TemporalRolloutCompanies(): string[] {
    const raw = this.configManager.get<string>('L3_TEMPORAL_ROLLOUT_COMPANIES', '');
    return String(raw ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  /** Temporal server address */
  getTemporalAddress(): string {
    return this.configManager.get<string>('TEMPORAL_ADDRESS', 'localhost:7233');
  }

  /** Temporal namespace */
  getTemporalNamespace(): string {
    return this.configManager.get<string>('TEMPORAL_NAMESPACE', 'default');
  }

  /** L3 CEO Heavy Temporal task queue */
  getTemporalCeoHeavyTaskQueue(): string {
    return this.configManager.get<string>('TEMPORAL_CEO_HEAVY_TASK_QUEUE', 'ceo-heavy-task-queue');
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

  getCeoClassifierTimeoutMs(): number {
    return this.configManager.get<number>('CEO_CLASSIFIER_TIMEOUT_MS', 400);
  }

  getCeoLightTimeoutMs(): number {
    return this.configManager.get<number>('CEO_LIGHT_TIMEOUT_MS', 2500);
  }

  getCeoLightPrimaryTimeoutMs(): number {
    return this.configManager.get<number>('CEO_LIGHT_PRIMARY_TIMEOUT_MS', 45000);
  }

  getCeoLightFallbackTimeoutMs(): number {
    return this.configManager.get<number>('CEO_LIGHT_FALLBACK_TIMEOUT_MS', 30000);
  }

  getCeoHeavyHybridTimeoutMs(): number {
    const raw = this.configManager.get<number | string | undefined>('CEO_HEAVY_HYBRID_TIMEOUT_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n)) return Math.max(5_000, Math.min(300_000, Math.floor(n)));
    return 240_000;
  }

  getCeoHeavyTimeoutMs(): number {
    const raw = this.configManager.get<number | string | undefined>('CEO_HEAVY_TIMEOUT_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n)) return Math.max(5_000, Math.min(300_000, Math.floor(n)));
    return 120_000;
  }

  getCeoHeavyQueueConcurrency(): number {
    const raw = this.configManager.get<number | string | undefined>('CEO_HEAVY_QUEUE_CONCURRENCY');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n)) return Math.max(1, Math.min(32, Math.floor(n)));
    return 5;
  }

  getEnqueueIdempotencyTtlMs(): number {
    const raw = this.configManager.get<number | string | undefined>('ENQUEUE_IDEMPOTENCY_TTL_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n)) {
      return Math.max(1_000, Math.min(3_600_000, Math.floor(n)));
    }
    return 600_000;
  }

  getDegradationMaxFallbackPerMessage(): number {
    const raw = this.configManager.get<number | string | undefined>('DEGRADATION_MAX_FALLBACK_PER_MESSAGE');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n)) return Math.max(1, Math.min(5, Math.floor(n)));
    return 1;
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

  isGoalDraftAutoKickoffSilent(): boolean {
    return this.configManager.get<boolean>('GOAL_DRAFT_AUTO_KICKOFF_SILENT', true);
  }

  isPostApprovalSilentModeEnabled(): boolean {
    return this.configManager.get<boolean>('POST_APPROVAL_SILENT_MODE', false);
  }

  isHeavyConfirmMessagePostApprovalEnabled(): boolean {
    return this.configManager.get<boolean>('HEAVY_CONFIRM_MESSAGE_POST_APPROVAL', true);
  }

  isFoundryHeavyStateMachineEnabled(): boolean {
    return this.configManager.get<boolean>('FOUNDRY_HEAVY_STATE_MACHINE_ENABLED', true);
  }

  getSplittingStageTimeoutMs(): number {
    const raw = this.configManager.get<number | string | undefined>('FOUNDRY_HEAVY_SPLITTNG_TIMEOUT_MS');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n === 'number' && Number.isFinite(n)) {
      return Math.max(5_000, Math.min(300_000, Math.floor(n)));
    }
    // Splitting stage timeout must be >= planner model timeout + 40s safety buffer.
    // Defaulting to 180s prevents stage timeout from preempting a 120s heavy planner call.
    return 180_000;
  }

  isHeavyForceStructuredOnPartialMergeEnabled(): boolean {
    return this.configManager.get<boolean>('FOUNDRY_HEAVY_FORCE_STRUCTURED_ON_PARTIAL_MERGE', true);
  }

  isCeoHeavyPlannerRawLoggingEnabled(): boolean {
    return this.configManager.get<boolean>('FOUNDRY_CEO_HEAVY_PLANNER_RAW_LOGGING_ENABLED', false);
  }

  getDiscussionModerationMaxSpeakers(): number {
    return this.configManager.get<number>('DISCUSSION_MODERATION_MAX_SPEAKERS', 4);
  }

  getCollabDirectReplyModel(): string {
    const direct = (this.configManager.get<string>('WORKER_COLLAB_DIRECT_MODEL', '') ?? '').trim();
    return direct;
  }

  getCollaborationDiagnosticFallbackMessage(): string {
    return this.configManager.get<string>(
      'COLLABORATION_FALLBACK_DIAGNOSTIC_MESSAGE',
      DEFAULT_COLLABORATION_DIAGNOSTIC_FALLBACK_MESSAGE,
    );
  }

  /**
   * @提及对象不在房内时 CEO provisional 提示文案模板；占位 `{mentionLabel}`（多名用顿号拼接）。
   * 未配置时使用 Worker 内置默认（简洁、可本地化）。
   */
  getCollabSummonMissingMembersNoticeTemplate(): string {
    return (this.configManager.get<string>('WORKER_COLLAB_SUMMON_MISSING_NOTICE_TEMPLATE', '') ?? '').trim();
  }

  /** collaboration.intent.classified.v2026_1 计划废弃时间（ISO8601）；空则事件不写 deprecatedAt */
  getCollaborationIntentClassifiedV20261DeprecatedAt(): string | undefined {
    const s = (this.configManager.get<string>('COLLABORATION_INTENT_CLASSIFIED_V2026_1_DEPRECATED_AT', '') ?? '').trim();
    return s || undefined;
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

  /** P2.2：召唤 Agent 回复是否注入公司画像块（全局默认，可被公司 runtime_preferences 覆盖） */
  getWorkerDirectAgentDefaultInjectCompanyProfile(): boolean {
    return this.configManager.get<boolean>('WORKER_DIRECT_AGENT_DEFAULT_INJECT_COMPANY_PROFILE', true);
  }

  /** P2.2：召唤 Agent 回复是否注入最近对话原文块 */
  getWorkerDirectAgentDefaultInjectRecentTranscript(): boolean {
    return this.configManager.get<boolean>('WORKER_DIRECT_AGENT_DEFAULT_INJECT_RECENT_TRANSCRIPT', true);
  }

  /** P2.2：最近对话块包含的消息条数（4–20） */
  getWorkerDirectAgentTranscriptMessageCount(): number {
    const n = this.configManager.get<number>('WORKER_DIRECT_AGENT_TRANSCRIPT_MESSAGE_COUNT', 10);
    return Math.min(20, Math.max(4, Math.floor(Number.isFinite(n) ? n : 10)));
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
    // 复盘仍写入 memory；默认不向主协作群推送长系统块，避免打断人类对话。
    return this.configManager.get<boolean>('WORKER_SUPERVISOR_POST_REVIEW_CHAT_ENABLED', false);
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

  isSkillProgressiveDisclosureEnabled(): boolean {
    return this.configManager.get<boolean>('FOUNDRY_SKILL_PROGRESSIVE_DISCLOSURE', true);
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
   * 平台 Admin「协作主链」DB 设置优先于进程 env（启动失败时回退 env）。
   */
  private boolFromMainChainOverlay(
    overlayKey: CollaborationMainChainSettingKey,
    envKey: string,
    defaultValue: boolean,
  ): boolean {
    const fromOverlay = this.mainChainOverlay()?.getBoolean(overlayKey);
    if (typeof fromOverlay === 'boolean') return fromOverlay;
    return this.configManager.get<boolean>(envKey, defaultValue);
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









