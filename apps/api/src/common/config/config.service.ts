import { Injectable, Inject } from '@nestjs/common';
import { ConfigManager } from '@service/config';
import {
  AppConfig,
  DatabaseConfig,
  RedisConfig,
  MonitoringConfig,
  HttpConfig,
  CorsConfig,
  StorageConfig,
  StorageType,
  ApiConfig,
  MemoryConfig,
} from './interfaces/config.interface.js';
import fs from 'node:fs/promises';

type DepartmentZhMap = Record<string, string>;

/**
 * 配置服务
 * 提供类型安全的配置访问
 * 使用 @service/config 进行配置管理
 */
@Injectable()
export class ConfigService {
  private configManager: ConfigManager;
  private cachedDeptZhMap: DepartmentZhMap | null = null;
  private cachedDeptZhMapLoadedAt = 0;

  constructor(@Inject('CONFIG_MANAGER') configManager: ConfigManager) {
    this.configManager = configManager;
  }

  get<T = string>(key: string, defaultValue?: T): T {
    return this.configManager.get<T>(key, defaultValue as T);
  }

  /**
   * 获取应用配置
   */
  getAppConfig(): AppConfig {
    return {
      nodeEnv: this.configManager.get<string>('NODE_ENV', 'development'),
      port: this.configManager.get<number>('PORT', 3000),
    };
  }

  /**
   * 获取数据库配置
   */
  getDatabaseConfig(): DatabaseConfig {
    return {
      host: this.configManager.get<string>('DB_HOST', 'localhost'),
      port: this.configManager.get<number>('DB_PORT', 5432),
      username: this.configManager.get<string>('DB_USERNAME', 'postgres'),
      password: this.configManager.get<string>('DB_PASSWORD', 'postgres'),
      database: this.configManager.get<string>('DB_DATABASE', 'service_db'),
      synchronize: this.configManager.get<boolean>('DB_SYNCHRONIZE', false),
      logging: this.configManager.get<boolean>('DB_LOGGING', false),
      ssl: this.configManager.get<boolean>('DB_SSL', false),
      sslRejectUnauthorized: this.configManager.get<boolean>('DB_SSL_REJECT_UNAUTHORIZED', true),
      connectionTimeout: this.configManager.get<number>('DB_CONNECTION_TIMEOUT', 2000),
      queryTimeout: this.configManager.get<number>('DB_QUERY_TIMEOUT', 30000),
      maxConnections: this.configManager.get<number>('DB_MAX_CONNECTIONS', 20),
      minConnections: this.configManager.get<number>('DB_MIN_CONNECTIONS', 5),
      transactionIsolation: this.configManager.get<'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'>(
        'DB_TRANSACTION_ISOLATION',
        'READ COMMITTED',
      ),
    };
  }

  /**
   * 获取 Redis 配置
   */
  getRedisConfig(): RedisConfig {
    return {
      host: this.configManager.get<string>('REDIS_HOST', 'localhost'),
      port: this.configManager.get<number>('REDIS_PORT', 6379),
      password: this.configManager.get<string>('REDIS_PASSWORD'),
      db: this.configManager.get<number>('REDIS_DB', 0),
      url: this.configManager.get<string>('REDIS_URL'),
    };
  }

  getRedisUrl(): string | undefined {
    const direct = this.configManager.get<string>('REDIS_URL', '');
    if (direct?.trim()) return direct.trim();
    const { host, port, password, db } = this.getRedisConfig();
    if (!host?.trim()) return undefined;
    const auth = password?.trim() ? `:${encodeURIComponent(password.trim())}@` : '';
    return `redis://${auth}${host.trim()}:${port ?? 6379}/${db ?? 0}`;
  }

  getRedisKeyPrefix(): string {
    return (this.configManager.get<string>('REDIS_KEY_PREFIX', '') || '').trim();
  }

  /**
   * 跨 API/Worker 共享的协作 KV。
   * 优先 COLLAB_REDIS_URL；否则用 REDIS_HOST + REDIS_DB_COLLAB（默认 0），避免各服务 REDIS_DB_* 隔离导致读不到 Worker 写入。
   */
  getCollabRedisUrl(): string | undefined {
    const collab = this.configManager.get<string>('COLLAB_REDIS_URL', '');
    if (collab?.trim()) return collab.trim();
    const { host, port, password } = this.getRedisConfig();
    if (!host?.trim()) return undefined;
    const collabDb = this.configManager.get<number>('REDIS_DB_COLLAB', 0);
    const auth = password?.trim() ? `:${encodeURIComponent(password.trim())}@` : '';
    return `redis://${auth}${host.trim()}:${port ?? 6379}/${collabDb}`;
  }

  /** Gateway/API 经 Redis Pub/Sub 推送协作消息（需与 Gateway 使用同一 Redis） */
  isCollaborationRedisNotifyEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_REDIS_NOTIFY', true);
  }

  /** Phase 2：主群 Replay 决策由 Worker 事件 SSOT 驱动。 */
  isCollabMainRoomReplaySsotPhase2Enabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_MAIN_ROOM_REPLAY_SSOT_PHASE2', true);
  }

  /** UUID thread 读 Redis 会话时不回退 main（E2E / 生产建议开启）。 */
  isCollabStrictThreadIsolationEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_STRICT_THREAD_ISOLATION', true);
  }

  isCollabDeptChatConversationalMode(): boolean {
    return this.configManager.get<boolean>('COLLAB_DEPT_CHAT_CONVERSATIONAL_MODE', true);
  }

  isCollabDeptTaskStageChatEnabled(): boolean {
    const raw = this.configManager.get<boolean | undefined>('COLLAB_DEPT_TASK_STAGE_CHAT_ENABLED', undefined);
    if (raw !== undefined) return raw;
    if (this.isCollabDeptChatConversationalMode()) return false;
    return true;
  }

  isCollabDeptDispatchSystemCardEnabled(): boolean {
    const raw = this.configManager.get<boolean | undefined>('COLLAB_DEPT_DISPATCH_SYSTEM_CARD_ENABLED', undefined);
    if (raw !== undefined) return raw;
    if (this.isCollabDeptChatConversationalMode()) return false;
    return true;
  }

  /**
   * 商城绑定变更事件：单次通知的最大公司数（防超大 MQ payload）。
   * 环境变量：MARKETPLACE_BINDING_NOTIFY_MAX_COMPANIES（默认 500，范围 1–50000）
   */
  getMarketplaceBindingNotifyMaxCompanies(): number {
    const raw = this.configManager.get<number | string | undefined>(
      'MARKETPLACE_BINDING_NOTIFY_MAX_COMPANIES',
    );
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n !== 'number' || Number.isNaN(n)) return 500;
    return Math.min(50_000, Math.max(1, Math.floor(n)));
  }

  /**
   * 单用户可创建（含草稿）的公司数量上限。
   * 环境变量：MAX_OWNED_COMPANIES_PER_USER（默认 3，范围 1–100）
   */
  getMaxOwnedCompaniesPerUser(): number {
    const raw = this.configManager.get<number | string | undefined>('MAX_OWNED_COMPANIES_PER_USER');
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n !== 'number' || Number.isNaN(n)) return 3;
    return Math.min(100, Math.max(1, Math.floor(n)));
  }

  /**
   * 员工端「商城配置」橙色预警：距上次同步超过该小时数即视为滞后。
   * 环境变量：AGENT_MARKETPLACE_CONFIG_STALE_HOURS（默认 72，范围 1–8760）
   */
  getAgentMarketplaceConfigStaleHours(): number {
    const raw = this.configManager.get<number | string | undefined>(
      'AGENT_MARKETPLACE_CONFIG_STALE_HOURS',
    );
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n !== 'number' || Number.isNaN(n)) return 72;
    return Math.min(8760, Math.max(1, Math.floor(n)));
  }

  /**
   * 获取监控配置
   */
  getMonitoringConfig(): MonitoringConfig {
    return {
      adapter: this.configManager.get<string>('METRICS_ADAPTER', 'prometheus'),
      enabled: this.configManager.get<boolean>('METRICS_ENABLED', true),
      prometheus: {
        collectDefaultMetrics: this.configManager.get<boolean>(
          'PROMETHEUS_COLLECT_DEFAULT_METRICS',
          true,
        ),
        prefix: this.configManager.get<string>(
          'PROMETHEUS_PREFIX',
          'api_service',
        ),
      },
    };
  }

  getPrometheusBaseUrl(): string {
    return this.configManager.get<string>('PROMETHEUS_BASE_URL', 'http://localhost:9090');
  }

  getPrometheusQueryTimeoutMs(): number {
    return this.configManager.get<number>('PROMETHEUS_QUERY_TIMEOUT_MS', 5000);
  }

  /**
   * 获取 HTTP 配置
   */
  getHttpConfig(): HttpConfig {
    return {
      timeout: this.configManager.get<number>('HTTP_TIMEOUT', 30000),
    };
  }

  /**
   * 获取 CORS 配置
   */
  getCorsConfig(): CorsConfig {
    const origin = this.configManager.get<string>('CORS_ORIGIN', '*');
    return {
      origin: origin === '*' ? '*' : origin.split(','),
      credentials: this.configManager.get<boolean>('CORS_CREDENTIALS', true),
    };
  }

  /**
   * Memory / RAG 嵌入配置
   */
  getMemoryConfig(): MemoryConfig {
    const projectionEnabled = this.configManager.get<boolean>('EMBEDDING_PROJECTION_ENABLED', false);
    const modelOutDim = this.configManager.get<number>('EMBEDDING_MODEL_DIM', 2048);
    const targetDim = this.configManager.get<number>('EMBEDDING_TARGET_DIM', 1536);
    const memoryEmbeddingDim = this.configManager.get<number>('MEMORY_EMBEDDING_DIMENSIONS', 2048);
    return {
      openaiApiKey: this.configManager.get<string>('OPENAI_API_KEY'),
      openaiBaseUrl: this.configManager.get<string>(
        'OPENAI_BASE_URL',
        'https://api.openai.com/v1',
      ),
      embeddingModel: this.configManager.get<string>(
        'MEMORY_EMBEDDING_MODEL',
        'text-embedding-3-large',
      ),
      embeddingProjectionEnabled: projectionEnabled,
      embeddingModelOutputDim: modelOutDim,
      embeddingTargetDim: targetDim,
      embeddingDimensions: projectionEnabled ? targetDim : memoryEmbeddingDim,
      ragQueryTimeoutMs: this.configManager.get<number>(
        'MEMORY_RAG_QUERY_TIMEOUT_MS',
        280,
      ),
      embeddingFetchTimeoutMs: this.configManager.get<number>(
        'EMBEDDING_FETCH_TIMEOUT_MS',
        15000,
      ),
      hybridVectorWeight: this.configManager.get<number>(
        'MEMORY_HYBRID_VECTOR_WEIGHT',
        0.72,
      ),
      hybridFullTextSearch: this.configManager.get<boolean>(
        'MEMORY_HYBRID_FULLTEXT',
        true,
      ),
      ragMinScore: this.configManager.get<number>('MEMORY_RAG_MIN_SCORE', 0),
      summaryDailyCap: this.configManager.get<number>(
        'MEMORY_SUMMARY_DAILY_CAP',
        0,
      ),
      elasticEnabled: this.configManager.get<boolean>('MEMORY_ELASTIC_ENABLED', false),
      elasticUrl: this.configManager.get<string>('MEMORY_ELASTIC_URL', '').trim() || undefined,
      elasticApiKey: this.configManager.get<string>('MEMORY_ELASTIC_API_KEY', '').trim() || undefined,
      elasticIndexPrefix: this.configManager.get<string>('MEMORY_ELASTIC_INDEX_PREFIX', 'memory').trim() || 'memory',
      elasticTimeoutMs: this.configManager.get<number>('MEMORY_ELASTIC_TIMEOUT_MS', 600),
    };
  }

  isSessionMemoryEnabled(): boolean {
    return this.configManager.get<boolean>('ENABLE_SESSION_MEMORY', true);
  }

  isMemoryConsolidationEnabled(): boolean {
    return this.configManager.get<boolean>('ENABLE_MEMORY_CONSOLIDATION', false);
  }

  isApprovalGateEnabled(): boolean {
    return this.configManager.get<boolean>('ENABLE_APPROVAL_GATE', false);
  }

  /** Phase 5: advanced multi-level approvals (default off). */
  isAdvancedApprovalEnabled(): boolean {
    return this.configManager.get<boolean>('ENABLE_ADVANCED_APPROVAL', false);
  }

  isAdvancedCompanyCreationWizardEnabled(): boolean {
    return this.configManager.get<boolean>('ENABLE_ADVANCED_COMPANY_CREATION_WIZARD', true);
  }

  getMemoryConsolidationWindowMessages(): number {
    return this.configManager.get<number>('MEMORY_CONSOLIDATION_WINDOW_MESSAGES', 50);
  }

  /** Phase 3 W13：Memory Graph V2 进程级总开关 */
  isMemoryGraphV2Enabled(): boolean {
    return this.configManager.get<boolean>('MEMORY_GRAPH_V2_ENABLED', false);
  }

  /**
   * Phase3：CEO 编排以 Memory Graph 为 cortex 主源；`facts.query` 中 company_people/org_structure
   * 在门控开启时仅允许内部模式：`memory_cortex_sync`、`main_room_replay_prefetch`。
   */
  isFactsAsFallbackOnlyEnabled(): boolean {
    return this.configManager.get<boolean>('FACTS_AS_FALLBACK_ONLY', true);
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

  /** 嵌入池主线路 unhealthy 时尝试的备用 embedding 模型 ID（未配置则仅依赖池内顺序与缓存恢复）。 */
  getMemoryEmbeddingPoolFallbackModelId(): string | undefined {
    const v = String(this.configManager.get<string>('MEMORY_EMBEDDING_POOL_FALLBACK_MODEL_ID', '') ?? '').trim();
    return v || undefined;
  }

  /** W14：成本感知 / 仪表盘扩展（默认关闭） */
  isCostAwareRoutingEnabled(): boolean {
    return this.configManager.get<boolean>('COST_AWARE_ROUTING_ENABLED', false);
  }

  getCostAwareBudgetThreshold(): number {
    const n = this.configManager.get<number>('COST_AWARE_BUDGET_THRESHOLD', 0.82);
    if (typeof n !== 'number' || !Number.isFinite(n)) return 0.82;
    return Math.min(1, Math.max(0, n));
  }

  /**
   * 获取存储配置
   */
  getStorageConfig(): StorageConfig {
    const type = this.configManager.get<StorageType>('STORAGE_TYPE', 'local');

    return {
      type,
      local: {
        basePath: this.configManager.get<string>(
          'STORAGE_LOCAL_BASE_PATH',
          './storage',
        ),
        baseUrl: this.configManager.get<string>(
          'STORAGE_LOCAL_BASE_URL',
          '/api/v1/files',
        ),
      },
      minio: {
        endpoint: this.configManager.get<string>(
          'STORAGE_MINIO_ENDPOINT',
          'localhost',
        ),
        port: this.configManager.get<number>('STORAGE_MINIO_PORT', 9000),
        useSSL: this.configManager.get<boolean>('STORAGE_MINIO_USE_SSL', false),
        accessKey: this.configManager.get<string>(
          'STORAGE_MINIO_ACCESS_KEY',
          'minioadmin',
        ),
        secretKey: this.configManager.get<string>(
          'STORAGE_MINIO_SECRET_KEY',
          'minioadmin',
        ),
        bucketName: this.configManager.get<string>(
          'STORAGE_MINIO_BUCKET_NAME',
          'files',
        ),
        baseUrl: this.configManager.get<string>('STORAGE_MINIO_BASE_URL'),
      },
      s3: {
        accessKeyId: this.configManager.get<string>('STORAGE_S3_ACCESS_KEY_ID')!,
        secretAccessKey: this.configManager.get<string>(
          'STORAGE_S3_SECRET_ACCESS_KEY',
        )!,
        region: this.configManager.get<string>('STORAGE_S3_REGION', 'us-east-1'),
        bucketName: this.configManager.get<string>('STORAGE_S3_BUCKET_NAME')!,
        endpoint: this.configManager.get<string>('STORAGE_S3_ENDPOINT'),
      },
      oss: {
        accessKeyId: this.configManager.get<string>('STORAGE_OSS_ACCESS_KEY_ID')!,
        accessKeySecret: this.configManager.get<string>(
          'STORAGE_OSS_ACCESS_KEY_SECRET',
        )!,
        region: this.configManager.get<string>('STORAGE_OSS_REGION')!,
        bucketName: this.configManager.get<string>('STORAGE_OSS_BUCKET_NAME')!,
        endpoint: this.configManager.get<string>('STORAGE_OSS_ENDPOINT'),
      },
    };
  }

  /**
   * 获取完整配置
   */
  getConfig(): ApiConfig {
    return {
      app: this.getAppConfig(),
      database: this.getDatabaseConfig(),
      redis: this.getRedisConfig(),
      monitoring: this.getMonitoringConfig(),
      http: this.getHttpConfig(),
      cors: this.getCorsConfig(),
      storage: this.getStorageConfig(),
      memory: this.getMemoryConfig(),
    };
  }

  /**
   * 部门英文/别名 -> 中文展示名映射
   * - 优先 DEPARTMENT_ZH_MAP_JSON（JSON 字符串）
   * - 其次 DEPARTMENT_ZH_MAP_PATH（JSON 文件路径）
   * - 否则返回空对象（由业务层使用默认映射/兜底）
   *
   * 为避免频繁 IO，带短缓存（默认 30s）。
   */
  async getDepartmentZhMap(): Promise<DepartmentZhMap> {
    const now = Date.now();
    if (this.cachedDeptZhMap && now - this.cachedDeptZhMapLoadedAt < 30_000) {
      return this.cachedDeptZhMap;
    }

    const rawJson = this.configManager.get<string>('DEPARTMENT_ZH_MAP_JSON', '').trim();
    if (rawJson) {
      const parsed = JSON.parse(rawJson) as DepartmentZhMap;
      this.cachedDeptZhMap = parsed ?? {};
      this.cachedDeptZhMapLoadedAt = now;
      return this.cachedDeptZhMap;
    }

    const path = this.configManager.get<string>('DEPARTMENT_ZH_MAP_PATH', '').trim();
    if (path) {
      const file = await fs.readFile(path, 'utf8');
      const parsed = JSON.parse(file) as DepartmentZhMap;
      this.cachedDeptZhMap = parsed ?? {};
      this.cachedDeptZhMapLoadedAt = now;
      return this.cachedDeptZhMap;
    }

    this.cachedDeptZhMap = {};
    this.cachedDeptZhMapLoadedAt = now;
    return this.cachedDeptZhMap;
  }

  getPhase1RolloutPercent(): number {
    const n = this.configManager.get<number>('PHASE1_ROLLOUT_PERCENT', 10);
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.floor(n))) : 10;
  }

  getPhase1RolloutWhitelistCompanyIds(): string[] {
    const raw = this.configManager.get<string>('PHASE1_ROLLOUT_WHITELIST_COMPANY_IDS', '') ?? '';
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** W12：与 Worker 对齐 — API 发布协作入站事件时用 */
  isAutonomousEventBusV2Enabled(): boolean {
    return this.configManager.get<boolean>('AUTONOMOUS_EVENT_BUS_V2_ENABLED', false);
  }

  isMultiAgentGraphV2Enabled(): boolean {
    return this.configManager.get<boolean>('MULTI_AGENT_GRAPH_V2_ENABLED', false);
  }

  isDirectorAutonomousEnabled(): boolean {
    return this.configManager.get<boolean>('DIRECTOR_AUTONOMOUS_ENABLED', false);
  }

  isEmployeeAutonomousEnabled(): boolean {
    return this.configManager.get<boolean>('EMPLOYEE_AUTONOMOUS_ENABLED', false);
  }

  isCrossDepartmentCoordinationEnabled(): boolean {
    return this.configManager.get<boolean>('CROSS_DEPARTMENT_COORDINATION_ENABLED', false);
  }

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
}

