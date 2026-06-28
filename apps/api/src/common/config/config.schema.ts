import Joi from 'joi';

/**
 * API 服务配置验证模式
 */
export const configSchema = Joi.object({
  // 应用配置
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  // 数据库配置
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().default('postgres'),
  DB_DATABASE: Joi.string().default('service_db'),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  // 数据库 SSL 配置
  DB_SSL: Joi.boolean().default(false),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().default(true),
  // 数据库连接池配置
  DB_CONNECTION_TIMEOUT: Joi.number().default(2000),
  DB_QUERY_TIMEOUT: Joi.number().default(30000),
  DB_MAX_CONNECTIONS: Joi.number().default(20),
  DB_MIN_CONNECTIONS: Joi.number().default(5),
  // 数据库事务隔离级别
  DB_TRANSACTION_ISOLATION: Joi.string()
    .valid('READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE')
    .default('READ COMMITTED'),

  // 缓存配置
  CACHE_ADAPTER_TYPE: Joi.string()
    .valid('auto', 'redis', 'memory')
    .default('auto')
    .description('缓存适配器类型: auto=自动选择(Redis优先), redis=强制Redis, memory=内存缓存'),

  // Redis 配置
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),
  REDIS_URL: Joi.string().optional(),
  REDIS_KEY_PREFIX: Joi.string().allow('').optional(),
  /** 跨 API/Worker 共享协作 KV；未设则用 REDIS_HOST + REDIS_DB_COLLAB */
  COLLAB_REDIS_URL: Joi.string().optional(),
  REDIS_DB_COLLAB: Joi.number().default(0),
  /**
   * API → Redis `collab:notify` → Gateway 广播协作事件（message:new、main_room_draft:updated、dispatch_plan_draft:updated、**collaboration_mode:updated** 等）。
   * 关则仅关闭推送，业务 RPC 仍可用；多实例网关需与 API 共用同一 Redis。
   */
  COLLAB_REDIS_NOTIFY: Joi.boolean().default(true),
  /** Phase 2：主群 Replay SSOT — 跳过同步 ReplayDecision，消费 Worker collaboration.replay.delegate.completed。 */
  COLLAB_MAIN_ROOM_REPLAY_SSOT_PHASE2: Joi.boolean().default(true),
  /** UUID thread 读协作 Redis 会话时不回退 main */
  COLLAB_STRICT_THREAD_ISOLATION: Joi.boolean().default(true),
  /** 部门群对话模式（默认 true） */
  COLLAB_DEPT_CHAT_CONVERSATIONAL_MODE: Joi.boolean().default(true),
  /** 任务生命周期镜像进部门群（默认 false） */
  COLLAB_DEPT_TASK_STAGE_CHAT_ENABLED: Joi.boolean().default(false),
  /** L2/手动派发是否写部门群系统派单卡（默认 false） */
  COLLAB_DEPT_DISPATCH_SYSTEM_CARD_ENABLED: Joi.boolean().default(false),

  // 监控配置
  METRICS_ADAPTER: Joi.string()
    .valid('prometheus', 'statsd', 'console', 'noop')
    .default('prometheus'),
  METRICS_ENABLED: Joi.boolean().default(true),
  PROMETHEUS_COLLECT_DEFAULT_METRICS: Joi.boolean().default(true),
  PROMETHEUS_PREFIX: Joi.string().default('api_service'),
  PROMETHEUS_BASE_URL: Joi.string().default('http://localhost:9090'),
  PROMETHEUS_QUERY_TIMEOUT_MS: Joi.number().integer().min(500).max(30000).default(5000),

  // HTTP 配置
  HTTP_TIMEOUT: Joi.number().default(30000), // HTTP 请求超时（毫秒）
  // RMQ RPC 队列确认策略（Nest request/reply 推荐 noAck=true，避免未手动 ack 导致消费槽位泄漏）
  API_RMQ_RPC_NOACK: Joi.boolean().default(true),
  API_RMQ_RPC_AUTONOMOUS_NOACK: Joi.boolean().default(true),

  // CORS 配置
  CORS_ORIGIN: Joi.string().default('*'),
  CORS_CREDENTIALS: Joi.boolean().default(true),

  // Swagger 配置
  SWAGGER_ENABLED: Joi.boolean().default(true), // 是否启用 Swagger（默认启用，生产环境建议禁用）
  SWAGGER_PATH: Joi.string().default('api-docs'), // Swagger UI 路径

  // 存储配置
  STORAGE_TYPE: Joi.string()
    .valid('minio', 's3', 'oss', 'local')
    .default('local')
    .description('存储类型: minio=MinIO, s3=AWS S3, oss=阿里云OSS, local=本地存储'),

  // 本地存储配置
  STORAGE_LOCAL_BASE_PATH: Joi.string().default('./storage'),
  STORAGE_LOCAL_BASE_URL: Joi.string().default('/api/v1/files'),

  // MinIO 配置
  STORAGE_MINIO_ENDPOINT: Joi.string().default('localhost'),
  STORAGE_MINIO_PORT: Joi.number().default(9000),
  STORAGE_MINIO_USE_SSL: Joi.boolean().default(false),
  STORAGE_MINIO_ACCESS_KEY: Joi.string().default('minioadmin'),
  STORAGE_MINIO_SECRET_KEY: Joi.string().default('minioadmin'),
  STORAGE_MINIO_BUCKET_NAME: Joi.string().default('files'),
  STORAGE_MINIO_BASE_URL: Joi.string().optional(),

  // AWS S3 配置
  STORAGE_S3_ACCESS_KEY_ID: Joi.string().optional(),
  STORAGE_S3_SECRET_ACCESS_KEY: Joi.string().optional(),
  STORAGE_S3_REGION: Joi.string().default('us-east-1'),
  STORAGE_S3_BUCKET_NAME: Joi.string().optional(),
  STORAGE_S3_ENDPOINT: Joi.string().optional(),

  // 阿里云 OSS 配置
  STORAGE_OSS_ACCESS_KEY_ID: Joi.string().optional(),
  STORAGE_OSS_ACCESS_KEY_SECRET: Joi.string().optional(),
  STORAGE_OSS_REGION: Joi.string().optional(),
  STORAGE_OSS_BUCKET_NAME: Joi.string().optional(),
  STORAGE_OSS_ENDPOINT: Joi.string().optional(),

  // Memory / embeddings（OpenAI 兼容 API，未配置 KEY 时使用确定性本地向量）
  OPENAI_API_KEY: Joi.string().allow('').optional(),
  OPENAI_BASE_URL: Joi.string().default('https://api.openai.com/v1'),
  /** 直连降级路径模型；2048 维时请用 text-embedding-3-large（或池化多模态） */
  MEMORY_EMBEDDING_MODEL: Joi.string().default('text-embedding-3-large'),
  /** 主 embedding 池节点均被标为 unhealthy 时，额外尝试的备用模型 ID（platform embedding_models.id） */
  MEMORY_EMBEDDING_POOL_FALLBACK_MODEL_ID: Joi.string().allow('').optional(),
  /** 与 memory_entries / Graph 校验一致；多模态豆包等常为 2048。池化时以 llm_models.embedding_dimensions 优先 */
  MEMORY_EMBEDDING_DIMENSIONS: Joi.number().integer().min(256).max(8192).default(2048),
  /**
   * Phase3：多模态上游维（如 2048）→ Memory Graph 目标维（如 1536）的固定种子线性投影。
   * 开启时 getMemoryConfig().embeddingDimensions 取 EMBEDDING_TARGET_DIM，与检索/入库一致。
   */
  EMBEDDING_PROJECTION_ENABLED: Joi.boolean().default(false),
  EMBEDDING_MODEL_DIM: Joi.number().integer().min(256).max(8192).default(2048),
  EMBEDDING_TARGET_DIM: Joi.number().integer().min(256).max(8192).default(1536),
  MEMORY_RAG_QUERY_TIMEOUT_MS: Joi.number().min(50).default(280),
  EMBEDDING_FETCH_TIMEOUT_MS: Joi.number().min(1000).default(15000),
  MEMORY_HYBRID_VECTOR_WEIGHT: Joi.number().min(0).max(1).default(0.72),
  MEMORY_HYBRID_FULLTEXT: Joi.boolean().default(true),
  MEMORY_RAG_MIN_SCORE: Joi.number().min(0).max(1).default(0),
  MEMORY_SUMMARY_DAILY_CAP: Joi.number().min(0).default(0),
  ENABLE_SESSION_MEMORY: Joi.boolean().default(true),
  ENABLE_MEMORY_CONSOLIDATION: Joi.boolean().default(false),
  ENABLE_APPROVAL_GATE: Joi.boolean().default(false),
  MEMORY_CONSOLIDATION_WINDOW_MESSAGES: Joi.number().integer().min(10).max(500).default(50),

  // External BM25 backend for Memory-RAG (Elastic/OpenSearch)
  MEMORY_ELASTIC_ENABLED: Joi.boolean().default(false),
  MEMORY_ELASTIC_URL: Joi.string().allow('').optional(),
  MEMORY_ELASTIC_API_KEY: Joi.string().allow('').optional(),
  MEMORY_ELASTIC_INDEX_PREFIX: Joi.string().default('memory'),
  MEMORY_ELASTIC_TIMEOUT_MS: Joi.number().integer().min(50).max(30000).default(600),

  // Org design / department mapping
  DEPARTMENT_ZH_MAP_JSON: Joi.string().allow('').optional().description('JSON string map: { "engineering": "工程部", ... }'),
  DEPARTMENT_ZH_MAP_PATH: Joi.string().allow('').optional().description('Path to JSON file with department zh map'),

  /** API → Runner RMQ 队列（与 apps/runner RUNNER_RMQ_QUEUE、Worker RUNNER_RMQ_RPC_QUEUE 一致） */
  RUNNER_RMQ_RPC_QUEUE: Joi.string().default('runner-rpc-queue'),
  /** company-space.* 等 Runner 转发 RPC 超时（毫秒） */
  API_RUNNER_RPC_TIMEOUT_MS: Joi.number().integer().min(3000).max(120000).default(45000),
  API_RUNNER_RMQ_PREFETCH: Joi.number().integer().min(1).max(50).default(5),

  /** W8：与 Worker 对齐的 Phase1 灰度展示/运维（仪表盘只读） */
  PHASE1_ROLLOUT_PERCENT: Joi.number().integer().min(0).max(100).default(10),
  PHASE1_ROLLOUT_WHITELIST_COMPANY_IDS: Joi.string().allow('').optional(),

  /** W12：与 Worker 对齐 — 领域入站 v2 + Phase2 灰度展示（默认关闭 legacy 替代路径） */
  AUTONOMOUS_EVENT_BUS_V2_ENABLED: Joi.boolean().default(false),
  MULTI_AGENT_GRAPH_V2_ENABLED: Joi.boolean().default(false),
  DIRECTOR_AUTONOMOUS_ENABLED: Joi.boolean().default(false),
  EMPLOYEE_AUTONOMOUS_ENABLED: Joi.boolean().default(false),
  CROSS_DEPARTMENT_COORDINATION_ENABLED: Joi.boolean().default(false),
  PHASE2_ROLLOUT_PERCENT: Joi.number().integer().min(0).max(100).default(0),
  PHASE2_ROLLOUT_WHITELIST_COMPANY_IDS: Joi.string().allow('').optional(),

  /** W16：与 Worker 对齐 — Phase3 全量渐进总闸与灰度（默认关闭） */
  PHASE3_ROLLOUT_ENABLED: Joi.boolean().default(false),
  PHASE3_ROLLOUT_PERCENT: Joi.number().integer().min(0).max(100).default(0),
  PHASE3_ROLLOUT_WHITELIST_COMPANY_IDS: Joi.string().allow('').optional(),

  /** W13：Memory Graph V2（因果/时序/关系）；默认关闭 */
  MEMORY_GRAPH_V2_ENABLED: Joi.boolean().default(false),
  /** Phase3：默认 100% 打开公司级 Graph V2 生效（仍受 MEMORY_GRAPH_V2_ENABLED 总闸约束）。 */
  MEMORY_GRAPH_V2_ROLLOUT_PERCENT: Joi.number().integer().min(0).max(100).default(100),
  MEMORY_GRAPH_V2_ROLLOUT_WHITELIST_COMPANY_IDS: Joi.string().allow('').optional(),
  MEMORY_GRAPH_TRAVERSAL_TIMEOUT_MS: Joi.number().integer().min(5).max(500).default(40),
  MEMORY_GRAPH_TRAVERSAL_DEPTH: Joi.number().integer().min(1).max(30).default(6),
  MEMORY_GRAPH_WEIGHT: Joi.number().min(0).max(1).default(0.18),
  MEMORY_GRAPH_QUERY_TIMEOUT_MS: Joi.number().integer().min(20).max(5000).default(80),

  /**
   * Phase3-final：CEO **默认** live `facts.query` 中 company_people/org_structure 被门控；
   * 放行：`factsClientMode=memory_cortex_sync`（cortex 同步）或 `main_room_replay_prefetch`（worker 主群 replay 预取，admin RPC）。
   * 默认 true；设为 false 时 CEO 可直接 live 查公司事实（旧路径）。
   */
  FACTS_AS_FALLBACK_ONLY: Joi.boolean().default(true),

  /** W14：与 Worker 对齐；Dashboard / Memory 严格事务门控（默认关闭） */
  COST_AWARE_ROUTING_ENABLED: Joi.boolean().default(false),
  COST_AWARE_BUDGET_THRESHOLD: Joi.number().min(0).max(1).default(0.82),

  // 邮件 / SMTP（密码重置等）
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  MAIL_DEV_LOG_ONLY: Joi.boolean().default(false),
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().integer().min(1).max(65535).default(587),
  SMTP_SECURE: Joi.boolean().optional(),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().email().allow('').optional(),
  MAIL_FROM: Joi.string().email().allow('').optional(),
  SMTP_CONNECTION_TIMEOUT_MS: Joi.number().integer().min(1000).max(120_000).default(10_000),
  SMTP_GREETING_TIMEOUT_MS: Joi.number().integer().min(1000).max(120_000).default(10_000),
  SMTP_SOCKET_TIMEOUT_MS: Joi.number().integer().min(1000).max(120_000).default(10_000),

  /** 新建公司高级向导（模板推荐 Top 3 + 前端 Step 2+） */
  ENABLE_ADVANCED_COMPANY_CREATION_WIZARD: Joi.boolean().default(
    process.env.NODE_ENV !== 'production',
  ),

  /** 单用户可创建（含草稿）的公司数量上限 */
  MAX_OWNED_COMPANIES_PER_USER: Joi.number().integer().min(1).max(100).default(3),

});








