import Joi from 'joi';

/**
 * Worker 服务配置验证模式
 */
export const configSchema = Joi.object({
  // 应用配置
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3004),
  APP_VERSION: Joi.string().optional(),

  // RabbitMQ 配置
  RABBITMQ_HOST: Joi.string().default('localhost'),
  RABBITMQ_PORT: Joi.number().default(5672),
  RABBITMQ_USER: Joi.string().default('guest'),
  RABBITMQ_PASSWORD: Joi.string().default('guest'),
  RABBITMQ_VHOST: Joi.string().default('/'),
  RABBITMQ_URI: Joi.string().optional(),
  RABBITMQ_PREFETCH_COUNT: Joi.number().default(10),
  RABBITMQ_RECONNECT_DELAY: Joi.number().default(5000),
  RABBITMQ_MAX_RETRIES: Joi.number().default(10),

  // Redis（Phase 2: llm_prep cache）
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),
  REDIS_URL: Joi.string().optional(),
  REDIS_KEY_PREFIX: Joi.string().allow('').optional(),

  /** 与 API 对齐的 AMQP URL（优先于 RABBITMQ_* 拼装） */
  RMQ_URL: Joi.string().optional(),
  /** Worker → apps/runner RMQ 队列（shell/exec 唯一入口） */
  RUNNER_RMQ_RPC_QUEUE: Joi.string().default('runner-rpc-queue'),
  /** `runner.execute` RPC 超时（毫秒）；Job 创建可能较慢，默认长于普通 API RPC */
  WORKER_RUNNER_EXECUTE_TIMEOUT_MS: Joi.number().integer().min(5000).max(600000).default(120_000),
  /** 兼容旧配置：若未设置 WORKER_API_RMQ_RPC_QUEUE，则回退到该值 */
  API_RMQ_RPC_QUEUE: Joi.string().default('api-rpc-queue'),
  /** API 自治/后台 RPC 队列名（Worker 默认应使用此队列） */
  API_RMQ_RPC_QUEUE_AUTONOMOUS: Joi.string().default('api-rpc-autonomous-queue'),
  /** Worker 专用 API RPC 队列（最高优先级，覆盖上面两个） */
  WORKER_API_RMQ_RPC_QUEUE: Joi.string().default('api-rpc-autonomous-queue'),
  CEO_INTERACTIVE_QUEUE_ENABLED: Joi.boolean().default(false),
  CEO_INTERACTIVE_QUEUE_NAME: Joi.string().default('ceo-interactive-queue'),
  CEO_INTERACTIVE_PREFETCH: Joi.number().integer().min(1).max(200).default(25),
  CEO_INTERACTIVE_TIMEOUT_MS: Joi.number().integer().min(500).max(120000).default(8000),
  /**
   * Worker → API 的 Nest RMQ RPC 客户端超时（毫秒）。
   * api-rpc-queue 积压时，过短会导致 billing.signals.refresh 等调用在排队阶段就超时。
   */
  WORKER_API_RPC_TIMEOUT_MS: Joi.number().integer().min(5000).max(300000).default(120000),
  /**
   * @CEO 提及 → tasks.create 等 RPC 专用超时（毫秒）。
   * api-rpc 队列积压时默认 120s 仍可能在排队阶段超时；不设时取 max(WORKER_API_RPC_TIMEOUT_MS, 180000)。
   */
  WORKER_COLLAB_MENTION_RPC_TIMEOUT_MS: Joi.number().integer().min(5000).max(600000).optional(),
  /** Worker 调 RPC 时使用的系统用户 id（需具备 admin 角色以完成摄入） */
  WORKER_ACTOR_USER_ID: Joi.string().uuid().optional(),

  /** 任务心跳调度间隔（毫秒），默认 2 分钟；验收可调大（如每小时） */
  TASK_HEARTBEAT_INTERVAL_MS: Joi.number().integer().min(5000).max(86400000).default(120000),
  /** 单次心跳最多发布多少 company tick；防止多租户一次性洪峰灌满 api-rpc-queue */
  TASK_HEARTBEAT_MAX_COMPANIES_PER_TICK: Joi.number().integer().min(1).max(10000).default(20),
  /**
   * nest_timer：本进程 setInterval 发 task.heartbeat.tick；
   * temporal：由 Temporal Schedule + temporal-worker 调内部 HTTP，禁止双重心跳。
   */
  TASK_HEARTBEAT_SOURCE: Joi.string().valid('nest_timer', 'temporal').default('nest_timer'),
  /** Company heartbeat: stuck task detection/recovery config */
  COMPANY_STUCK_TASK_DETECTION_ENABLED: Joi.boolean().default(true),
  COMPANY_STUCK_MAX_HOURS_IN_PROGRESS: Joi.number().min(0.1).max(720).default(4),
  COMPANY_STUCK_MAX_HOURS_BLOCKED: Joi.number().min(0.1).max(720).default(2),
  COMPANY_STUCK_EMERGENCY_THRESHOLD: Joi.number().integer().min(1).max(200).default(3),
  COMPANY_STUCK_MAX_SELF_MENTION_RETRIES: Joi.number().integer().min(0).max(20).default(2),
  /** POST /api/internal/temporal/* 校验头 X-Internal-Auth；不设则内部路由返回 503 */
  WORKER_INTERNAL_API_SECRET: Joi.string().allow('').optional(),

  /** CEO LangGraph LLM（OpenAI 兼容为主；Claude 需 Anthropic） */
  OPENAI_API_KEY: Joi.string().allow('').optional(),
  ANTHROPIC_API_KEY: Joi.string().allow('').optional(),
  CEO_LLM_TIMEOUT_MS: Joi.number().integer().min(5000).max(600000).default(120000),
  /**
   * 协作 @CEO 自动回复专用 LLM 超时（毫秒）。不设时取 max(CEO_LLM_TIMEOUT_MS, 240000)。
   * OpenAI SDK 在慢网/跨境时常报 Request timed out，可适当加大。
   */
  WORKER_COLLAB_LLM_TIMEOUT_MS: Joi.number().integer().min(5000).max(600000).optional(),
  /**
   * CEO plan 注入 user 消息的 context= 最大字符数（contextBundle 前缀）。默认 12000。
   */
  WORKER_CEO_PLAN_CONTEXT_MAX_CHARS: Joi.number().integer().min(2000).max(100000).optional(),
  /**
   * 智谱 GLM 等 OpenAI 兼容接口常在 ~150s 切断长请求；breakdown 时对 glm* 模型再收紧 context 上限（与 WORKER_CEO_PLAN_CONTEXT_MAX_CHARS 取较小值）。默认 4000。
   */
  WORKER_CEO_GLM_PLAN_CONTEXT_MAX_CHARS: Joi.number().integer().min(2000).max(100000).optional(),
  /**
   * breakdown + glm* 时 CEO plan 的 max_output_tokens（加快收束，减轻上游读超时）。默认 1280。
   */
  WORKER_CEO_GLM_MAX_OUTPUT_TOKENS: Joi.number().integer().min(256).max(8192).optional(),
  /** breakdown + glm：用精简摘要替代 contextBundle 大段 JSON，显著降低上游读超时概率 */
  WORKER_CEO_GLM_SLIM_CONTEXT_ENABLED: Joi.boolean().default(true),
  /**
   * breakdown ingest 里 tasks.findAll 的 pageSize（心跳仍为 50）。减小可降低上下文体积与 ingest 耗时。
   */
  WORKER_CEO_BREAKDOWN_INGEST_TASK_PAGE_SIZE: Joi.number().integer().min(5).max(100).optional(),
  CEO_LLM_MAX_OUTPUT_TOKENS: Joi.number().integer().min(256).max(16000).default(4096),
  /** 调用 LLM 前 billing.checkAllowance 的预估成本（与预算金额同单位） */
  CEO_LLM_ESTIMATED_COST: Joi.number().min(0).default(0),
  /** Agent 自治执行 skills 前 billing.checkAllowance 的预估扣费（与 budgets 金额同单位） */
  AGENT_SKILL_BUDGET_ESTIMATE: Joi.number().min(0).default(0.01),
  /** external HTTP skill 额外预检扣费估值（叠加或单独用于高成本工具闸） */
  EXTERNAL_SKILL_BUDGET_ESTIMATE: Joi.number().min(0).default(0.05),
  CEO_REPORT_MAX_CHARS: Joi.number().integer().min(500).max(65535).default(8000),

  /** 事件触发 CEO 的冷却（毫秒） */
  AUTONOMOUS_COOLDOWN_TASK_COMPLETED_MS: Joi.number().integer().min(0).max(3600000).default(120000),
  AUTONOMOUS_COOLDOWN_BUDGET_WARNING_MS: Joi.number().integer().min(0).max(3600000).default(900000),
  ENABLE_AUTONOMOUS_MEMORY_ADAPTER: Joi.boolean().default(true),
  AUTONOMOUS_MEMORY_STORE_MODE: Joi.string()
    .valid('ceo_autonomous', 'session')
    .default('ceo_autonomous'),

  ENABLE_MEMORY_CONSOLIDATION: Joi.boolean().default(false),
  ENABLE_LAYERED_GRAPH: Joi.boolean().default(false),
  MEMORY_CONSOLIDATION_WINDOW_MESSAGES: Joi.number().integer().min(10).max(500).default(50),

  /** 可选：LangGraph Postgres Checkpoint；未设置则使用 MemorySaver */
  WORKER_CHECKPOINT_DATABASE_URL: Joi.string().allow('').optional(),
  LANGGRAPH_CHECKPOINT_SCHEMA: Joi.string().default('langgraph_checkpoint'),

  /** 群聊意图分类（不设则仅用启发式规则） */
  COLLAB_INTENT_MODEL: Joi.string().allow('').optional(),
  COLLAB_INTENT_LLM_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(8000),
  COLLAB_INTENT_CONFIDENCE_THRESHOLD: Joi.number().min(0).max(1).default(0.85),
  /**
   * CEO 群聊路由决策专用模型；未设置时回退到 COLLAB_INTENT_MODEL。
   * 不设且 COLLAB_INTENT_MODEL 也为空则仅用启发式。
   */
  CEO_CLASSIFIER_MODEL: Joi.string().allow('').optional(),
  /** CEO 轻量回复模型（casual/direct 简单场景） */
  CEO_LIGHT_MODEL: Joi.string().allow('').optional(),
  /** CEO 重推理模型（执行编排/复杂场景） */
  CEO_HEAVY_MODEL: Joi.string().allow('').optional(),
  CEO_DECISION_MODEL: Joi.string().allow('').optional(),
  CEO_DECISION_LLM_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).optional(),
  CEO_DECISION_MAX_OUTPUT_TOKENS: Joi.number().integer().min(256).max(2048).default(512),
  CEO_DECISION_MAX_CONTEXT_MESSAGES: Joi.number().integer().min(5).max(200).default(40),
  CEO_DECISION_CACHE_ENABLED: Joi.boolean().default(true),
  CEO_DECISION_CACHE_TTL_MS: Joi.number().integer().min(0).max(3600000).default(120000),
  CEO_LLM_PREP_CACHE_ENABLED: Joi.boolean().default(false),
  CEO_LLM_PREP_CACHE_TTL_MS: Joi.number().integer().min(1000).max(600000).default(20000),
  CEO_PRELOAD_ENABLED: Joi.boolean().default(false),
  CEO_PRELOAD_PREFETCH: Joi.number().integer().min(1).max(200).default(10),
  CEO_PRELOAD_MAX_CONCURRENCY: Joi.number().integer().min(1).max(200).default(15),
  CEO_PRELOAD_COOLDOWN_MS: Joi.number().integer().min(1000).max(600000).default(30000),
  CEO_FASTPATH_ENABLED: Joi.boolean().default(true),
  CEO_FASTPATH_HIGH_CONFIDENCE_THRESHOLD: Joi.number().min(0).max(1).default(0.92),
  CEO_FASTPATH_MEDIUM_CONFIDENCE_THRESHOLD: Joi.number().min(0).max(1).default(0.87),
  CEO_FASTPATH_CONFIDENCE_GAP: Joi.number().min(0).max(1).default(0.08),
  CEO_CLASSIFIER_TIMEOUT_MS: Joi.number().integer().min(100).max(120000).default(400),
  CEO_LIGHT_TIMEOUT_MS: Joi.number().integer().min(200).max(180000).default(2500),
  CEO_LIGHT_PRIMARY_TIMEOUT_MS: Joi.number().integer().min(500).max(180000).default(6000),
  CEO_LIGHT_FALLBACK_TIMEOUT_MS: Joi.number().integer().min(500).max(180000).default(4000),
  CEO_HEAVY_TIMEOUT_MS: Joi.number().integer().min(500).max(600000).default(12000),
  /** 高于此置信度的启发式结果将跳过 CEO LLM */
  CEO_DECISION_HEURISTIC_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.85),
  /** CEO 决策后是否回写 collaboration.rooms.collaborationMode（供前端只读展示） */
  CEO_DECISION_SYNC_ROOM_MODE: Joi.boolean().default(true),
  /**
   * 群聊流水线：requiresHumanApproval 时在 LangGraph 内 interrupt，下一条用户消息 Command.resume。
   * false 时仅发房间提示，不暂停图（无 checkpoint 需求时也可用）。
   */
  CEO_ROOM_APPROVAL_INTERRUPT_ENABLED: Joi.boolean().default(true),
  /** 讨论控场：本轮建议最大并行发言人数上限（与 CEO JSON 取较小值） */
  DISCUSSION_MODERATION_MAX_SPEAKERS: Joi.number().integer().min(1).max(8).default(4),
  /** Direct 模式 Agent 回复用模型 */
  WORKER_COLLAB_DIRECT_MODEL: Joi.string().default('gpt-4o-mini'),
  /**
   * CEO/Agent 直聊注入的近期房间消息条数（人机交替计条数，0=关闭多轮上下文）。
   * 仅同 room；有 threadId 时只带该线程内消息，否则只带主时间线（thread_id 为空）。
   */
  WORKER_COLLAB_DIRECT_HISTORY_LIMIT: Joi.number().integer().min(0).max(100).default(8),
  /** 群聊直聊/纪要是否对当前用户句做 memory.search（分层检索） */
  WORKER_GROUP_CHAT_MEMORY_RETRIEVAL: Joi.boolean().default(true),
  WORKER_GROUP_CHAT_MEMORY_TOP_K: Joi.number().integer().min(1).max(24).default(8),
  WORKER_GROUP_CHAT_DIGEST_TRANSCRIPT_LIMIT: Joi.number().integer().min(10).max(200).default(40),
  /** P3: allow rollback of async memory consolidation request in direct structured replies */
  WORKER_DIRECT_REPLY_AUTO_CONSOLIDATE: Joi.boolean().default(true),
  /** 流式回复 chunk 合并：最小时间窗（毫秒） */
  WORKER_COLLAB_STREAM_MIN_INTERVAL_MS: Joi.number().integer().min(10).max(500).default(60),
  /** 流式回复 chunk 合并：最小字符数 */
  WORKER_COLLAB_STREAM_MIN_CHARS: Joi.number().integer().min(1).max(200).default(12),
  /** structured 模式可使用更稳的合并参数 */
  WORKER_COLLAB_STREAM_STRUCTURED_MIN_INTERVAL_MS: Joi.number().integer().min(10).max(500).default(75),
  WORKER_COLLAB_STREAM_STRUCTURED_MIN_CHARS: Joi.number().integer().min(1).max(300).default(15),
  /** G1: structured 后 Supervisor 复盘开关（非阻塞） */
  WORKER_SUPERVISOR_POST_REVIEW_ENABLED: Joi.boolean().default(true),
  /** G1: 复盘最多输出多少条发现项 */
  WORKER_SUPERVISOR_POST_REVIEW_MAX_FINDINGS: Joi.number().integer().min(1).max(10).default(3),
  /** G1: 是否把复盘短评发回群聊 */
  WORKER_SUPERVISOR_POST_REVIEW_CHAT_ENABLED: Joi.boolean().default(true),
  /** G1: Supervisor 复盘专用模型（空则复用 WORKER_COLLAB_DIRECT_MODEL） */
  WORKER_SUPERVISOR_POST_REVIEW_MODEL: Joi.string().allow('').optional(),
  WORKER_SUPERVISOR_POST_REVIEW_LLM_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(12000),
  /** G1: 日报/周报聚合结果是否推送群聊简讯 */
  WORKER_SUPERVISOR_REVIEW_CHAT_SUMMARY_ENABLED: Joi.boolean().default(true),

  /** 仅开发环境：启用 file-read / code-run 占位 builtin（生产应保持 false） */
  WORKER_ALLOW_UNSAFE_SKILL_STUBS: Joi.boolean().default(false),

  /**
   * External HTTP Skill 执行白名单（逗号分隔 host 或 host:port）。
   * 示例：`api.internal,localhost:8080`
   */
  SKILL_HTTP_ALLOWLIST: Joi.string().allow('').default(''),
  /** External HTTP Skill 统一超时（毫秒） */
  SKILL_HTTP_TIMEOUT_MS: Joi.number().integer().min(1000).max(300000).default(15000),

  /** 逗号分隔 Webhook URL；task.run.failed 等告警 POST JSON */
  ALERT_WEBHOOK_URLS: Joi.string().allow('').optional(),
  /** Admin 前端 base（用于告警 deepLink），如 https://admin.example.com */
  ADMIN_PUBLIC_BASE_URL: Joi.string().allow('').optional(),

  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().allow('').optional(),
  OTEL_SERVICE_NAME: Joi.string().allow('').optional(),

  // Consul 配置（可选）
  CONSUL_ENABLED: Joi.boolean().default(false),
  CONSUL_HOST: Joi.string().default('localhost'),
  CONSUL_PORT: Joi.number().default(8500),
  CONSUL_CONFIG_PREFIX: Joi.string().default('config/'),
  CONSUL_SECURE: Joi.boolean().default(false),
  // Allow empty token in local dev when CONSUL is disabled.
  CONSUL_TOKEN: Joi.string().allow('').optional(),
  CONSUL_DATACENTER: Joi.string().optional(),
});









