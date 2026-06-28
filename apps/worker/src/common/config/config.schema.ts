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
  RABBITMQ_USER: Joi.string().default('admin'),
  RABBITMQ_PASSWORD: Joi.string().default('admin123'),
  RABBITMQ_VHOST: Joi.string().default('/'),
  RABBITMQ_URI: Joi.string().optional(),
  RABBITMQ_PREFETCH_COUNT: Joi.number().default(10),
  RABBITMQ_RECONNECT_DELAY: Joi.number().default(5000),
  RABBITMQ_MAX_RETRIES: Joi.number().default(10),
  /** RabbitMQ / amqplib heartbeat（秒），与 broker heartbeat 配置对齐（默认 60） */
  RABBITMQ_HEARTBEAT_SECONDS: Joi.number().integer().min(10).max(600).default(60),
  /** TCP keepalive delay（毫秒） */
  RABBITMQ_KEEPALIVE_DELAY_MS: Joi.number().integer().min(0).max(600000).default(10000),

  // Redis（Phase 2: llm_prep cache）
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),
  REDIS_URL: Joi.string().optional(),
  REDIS_KEY_PREFIX: Joi.string().allow('').optional(),
  COLLAB_REDIS_URL: Joi.string().optional(),
  REDIS_DB_COLLAB: Joi.number().default(0),

  /** 与 API 对齐的 AMQP URL（优先于 RABBITMQ_* 拼装） */
  RMQ_URL: Joi.string().optional(),
  /** Nest RMQ socketOptions 心跳（秒）；默认 60（更抗 event-loop 短暂卡顿） */
  RMQ_HEARTBEAT_SECONDS: Joi.number().integer().min(10).max(600).default(60),
  RMQ_RECONNECT_SECONDS: Joi.number().integer().min(1).max(120).default(5),
  RMQ_KEEPALIVE_DELAY_MS: Joi.number().integer().min(0).max(600000).default(10000),
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
   * billing.record.append 专用超时（毫秒）。入账涉及 DB 事务 + 预算/用量联动，
   * 在队列积压或数据库慢时更容易超过通用 RPC 超时。
   */
  WORKER_BILLING_APPEND_TIMEOUT_MS: Joi.number().integer().min(5000).max(900000).default(300000),
  /**
   * @CEO 提及 → tasks.create 等 RPC 专用超时（毫秒）。
   * api-rpc 队列积压时默认 120s 仍可能在排队阶段超时；不设时取 max(WORKER_API_RPC_TIMEOUT_MS, 180000)。
   */
  WORKER_COLLAB_MENTION_RPC_TIMEOUT_MS: Joi.number().integer().min(5000).max(600000).optional(),
  /** Worker 调 RPC 时使用的系统用户 id（需具备 admin 角色以完成摄入） */
  WORKER_ACTOR_USER_ID: Joi.string().uuid().optional(),

  /** 任务心跳调度间隔（毫秒），默认 10 分钟；验收可调大（如每小时） */
  TASK_HEARTBEAT_INTERVAL_MS: Joi.number().integer().min(5000).max(86400000).default(600000),
  /** 平稳期跳过 CEO LangGraph（ingest+plan LLM），仅跑 Review/Report + pending + Director fan-out */
  HEARTBEAT_TIERED_CEO_GRAPH_ENABLED: Joi.boolean().default(true),
  /** 距上次全量 CEO 图的最长间隔（毫秒），超时则强制 full graph */
  CEO_LLM_PLAN_FORCE_INTERVAL_MS: Joi.number().integer().min(60000).max(604800000).default(3600000),
  /** 健康分低于此值时必走全量 CEO 图 */
  HEARTBEAT_STEADY_HEALTH_MIN: Joi.number().integer().min(0).max(100).default(65),
  /** 同公司两次心跳主链路执行的最小间隔（毫秒）；用于抑制审批等事件造成的密集补触发 */
  HEARTBEAT_MIN_INTERVAL_MS: Joi.number().integer().min(0).max(86400000).default(60000),
  /** 单次心跳最多发布多少 company tick；防止多租户一次性洪峰灌满 api-rpc-queue */
  TASK_HEARTBEAT_MAX_COMPANIES_PER_TICK: Joi.number().integer().min(1).max(10000).default(20),
  /**
   * nest_timer：本进程 setInterval 发 task.heartbeat.tick；
   * temporal：由 Temporal Schedule + temporal-worker 调内部 HTTP，禁止双重心跳。
   */
  TASK_HEARTBEAT_SOURCE: Joi.string().valid('nest_timer', 'temporal').default('nest_timer'),
  /** 公司级执行协调（心跳锁、图锁、自治冷却）优先使用 Redis */
  COMPANY_EXECUTION_COORDINATION_REDIS_ENABLED: Joi.boolean().default(true),
  /** 公司心跳 in-flight 分布式锁 TTL（毫秒） */
  CEO_HEARTBEAT_LOCK_TTL_MS: Joi.number().integer().min(5000).max(600000).default(180000),
  /** CEO LangGraph 全局锁 TTL（毫秒） */
  CEO_GRAPH_LOCK_TTL_MS: Joi.number().integer().min(5000).max(600000).default(300000),
  /**
   * 多 Worker 副本部署时强制要求 REDIS_URL；无 Redis 时拒绝获取分布式锁（单实例可 false）。
   */
  WORKER_MULTI_INSTANCE_STRICT: Joi.boolean().default(false),
  /** 心跳 tick 内 companyOrchestrator.runHeartbeat 失败时 rethrow 以触发 MQ 重试 */
  HEARTBEAT_TICK_RETHROW_ON_FAILURE: Joi.boolean().default(true),
  /** 紧急恢复（stuck 超阈值）时仍执行 pending agent 扫描 */
  COMPANY_EMERGENCY_RECOVERY_RUN_PENDING: Joi.boolean().default(true),
  /** 单次心跳/事件周期内最多处理的 agent 待办数 */
  PENDING_AGENT_TASKS_MAX_PER_TICK: Joi.number().integer().min(1).max(500).default(50),
  /** 生产环境强制 WORKER_CHECKPOINT_DATABASE_URL */
  WORKER_CHECKPOINT_REQUIRED: Joi.boolean().default(false),
  /** Director 部门规划走 Temporal activity（stage5） */
  WORKER_DIRECTOR_TEMPORAL_ENABLED: Joi.boolean().default(false),
  /** Company heartbeat: stuck task detection/recovery config */
  COMPANY_STUCK_TASK_DETECTION_ENABLED: Joi.boolean().default(true),
  COMPANY_STUCK_MAX_HOURS_IN_PROGRESS: Joi.number().min(0.1).max(720).default(4),
  COMPANY_STUCK_MAX_HOURS_BLOCKED: Joi.number().min(0.1).max(720).default(2),
  COMPANY_STUCK_EMERGENCY_THRESHOLD: Joi.number().integer().min(1).max(200).default(3),
  COMPANY_STUCK_MAX_SELF_MENTION_RETRIES: Joi.number().integer().min(0).max(20).default(2),
  /** 是否将公司心跳汇报推送到主协作群聊（默认关闭，避免打断用户主对话） */
  COMPANY_HEARTBEAT_CHAT_REPORT_ENABLED: Joi.boolean().default(false),
  /** 心跳报告内容哈希去重窗口（毫秒）；窗口内相同内容只保留一份 memory 报告 */
  COMPANY_HEARTBEAT_REPORT_DEDUP_WINDOW_MS: Joi.number().integer().min(0).max(86400000).default(600000),
  /**
   * PR5：Heartbeat 完成事件 / CEO 群消息 metadata 与协作 pipeline 审计事件写入 `heartbeatCorrelation`（可 join）。
   * 关闭则不再附加结构化关联（仍保留历史 `traceId` 字段）。
   */
  COLLAB_HEARTBEAT_CORRELATION_ENABLED: Joi.boolean().default(true),
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
  COLLAB_INTENT_LLM_ENABLED: Joi.boolean().default(true),
  COLLAB_INTENT_MODEL: Joi.string().allow('').optional(),
  COLLAB_INTENT_LLM_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(8000),
  /** 同步监督 inline 路径耗时预算（毫秒），仅用于日志/告警 */
  COLLAB_SUPERVISION_INLINE_BUDGET_MS: Joi.number().integer().min(5000).max(300000).default(43000),
  COLLAB_CEO_V2_TOOL_SURFACE_MODE: Joi.string().valid('off', 'warn', 'strict').default('off'),
  COLLAB_CEO_V2_TOOL_SURFACE_PLANNING_ALLOWLIST: Joi.string().allow('').optional(),
  COLLAB_CEO_V2_TOOL_SURFACE_ORCHESTRATION_ALLOWLIST: Joi.string().allow('').optional(),
  COLLAB_CEO_V2_TOOL_SURFACE_SUPERVISION_ALLOWLIST: Joi.string().allow('').optional(),
  COLLAB_CEO_V2_HEAVY_DEFAULT_TEMPORAL: Joi.boolean().default(false),
  PREDICTIVE_MOE_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(20000),
  /**
   * Predictive MoE 命中后直接短路主 classifier 的最低置信度。
   * 低于该阈值会继续调用 fallback classifier 复核。
   */
  PREDICTIVE_MOE_SHORT_CIRCUIT_CONFIDENCE: Joi.number().min(0).max(1).default(0.9),
  /**
   * 当 Predictive MoE 已命中但仍需 fallback 复核时，fallback 的最大等待时长（毫秒）。
   * 超时则回退使用 MoE 结果，避免链路过长。
   */
  PREDICTIVE_MOE_FALLBACK_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(6000),
  COLLAB_INTENT_CONFIDENCE_THRESHOLD: Joi.number().min(0).max(1).default(0.85),
  /**
   * 主群 @Director 漏房时，在进入显式直连路径前自动 RPC `collaboration.members.add` 拉入成员。
   * 默认 false；staging 建议 true。
   */
  COLLAB_SUMMON_AUTO_JOIN_MAIN: Joi.boolean().default(false),
  /**
   * 主群显式多 agent 直连、`routingHints.targetAgentIds` 与 `handleDirectedReplyPath` 单次轮询上限。
   * 默认 16 适配「CEO + 多部门主管」主群；可降到 4 等以控成本。
   */
  COLLAB_MAIN_ROOM_MAX_DIRECT_TARGETS: Joi.number().integer().min(1).max(32).default(16),
  /**
   * 主群讨论模式（Ask）：人类 @≥2 agent 时是否在 **pipeline listener 完成 CEO 侧写回后** 发布
   * `collaboration.main-room.roundtable.step`。生产默认 **开启**；若需关闭（降本 / 排障）设置 `COLLAB_MAIN_ROOM_ROUNDTABLE_ENABLED=false`。
   */
  COLLAB_MAIN_ROOM_ROUNDTABLE_ENABLED: Joi.boolean().default(true),
  /** 单轮圆桌最多 append 的 agent 条数（不超过参与者人数）。 */
  COLLAB_MAIN_ROOM_ROUNDTABLE_MAX_ROUNDS: Joi.number().integer().min(1).max(12).default(4),
  /** 圆桌幂等 Redis 键 TTL（毫秒）。 */
  COLLAB_MAIN_ROOM_ROUNDTABLE_REDIS_TTL_MS: Joi.number().integer().min(60_000).max(3_600_000).default(600_000),
  /** Agent 间 `message_send_to_agent` 工具异步唤醒目标 Agent 回复（主群 peer summon）。 */
  COLLAB_AGENT_PEER_SUMMON_ENABLED: Joi.boolean().default(true),
  /** 单条 peer summon 事件最多唤醒的目标 Agent 数（第一期固定 1）。 */
  COLLAB_AGENT_PEER_SUMMON_MAX_PER_EVENT: Joi.number().integer().min(1).max(4).default(1),
  /**
   * 主群多目标直连时，并行调用 `generateDirectedAgentReply` 的并发上限（生成阶段；落库仍按目标顺序串行）。
   * 默认 6；设为 1 则退化为完全串行（与旧行为一致）。
   */
  COLLAB_MAIN_ROOM_DIRECT_REPLY_CONCURRENCY: Joi.number().integer().min(1).max(16).default(6),
  /**
   * 主群直连 Agent（`collab.directed.reply`）的模型 max_output_tokens 上限。
   * 默认 2048：完整回复优先；触顶时由续写轮补全，仍可通过环境控费。
   */
  COLLAB_DIRECT_REPLY_MAX_OUTPUT_TOKENS: Joi.number().integer().min(128).max(8192).default(2048),
  /**
   * 部门群直连（Director / 员工 @）的 max_output_tokens 上限（高于主群，适配拆工与协作说明）。
   */
  COLLAB_DEPT_DIRECT_REPLY_MAX_OUTPUT_TOKENS: Joi.number().integer().min(256).max(8192).default(4096),
  /**
   * 单目标 fast handover（`collab.direct.handover`）直连的 max_output_tokens 上限。
   */
  COLLAB_DIRECT_REPLY_FAST_MAX_OUTPUT_TOKENS: Joi.number().integer().min(128).max(2048).default(512),
  /**
   * 直连回复触顶（finish_reason=length）时自动续写最大轮次（不含首轮）。
   */
  COLLAB_DIRECT_REPLY_LENGTH_CONTINUATION_MAX_ROUNDS: Joi.number().integer().min(0).max(4).default(2),
  /**
   * 用户可见正文极端硬上限（字符）；超过时追加明示说明，禁止静默截断。
   */
  COLLAB_DIRECT_REPLY_VISIBLE_TEXT_HARD_CAP: Joi.number().integer().min(8000).max(120_000).default(48_000),
  /** 直连回复是否发布 stream_chunk（最终仍写完整 text）。 */
  COLLAB_DIRECT_REPLY_STREAMING_ENABLED: Joi.boolean().default(true),
  /** 部门群直连是否发布 stream_chunk（未设时回退 COLLAB_DIRECT_REPLY_STREAMING_ENABLED）。 */
  COLLAB_DEPT_DIRECT_REPLY_STREAMING_ENABLED: Joi.boolean().optional(),
  /** stream_chunk 单块字符数（模拟流式，与心跳汇报一致）。 */
  COLLAB_DIRECT_REPLY_STREAM_CHUNK_CHARS: Joi.number().integer().min(48).max(1200).default(200),
  /** 是否启用 LLM model.stream() 真实 token 级流式（最终仍写完整 text）。 */
  COLLAB_LLM_TOKEN_STREAMING_ENABLED: Joi.boolean().default(true),
  /** token 流 flush 最小间隔（毫秒）。 */
  COLLAB_LLM_TOKEN_STREAM_FLUSH_MS: Joi.number().integer().min(8).max(500).default(40),
  /** token 流 flush 最小可见字符增量。 */
  COLLAB_LLM_TOKEN_STREAM_MIN_CHARS: Joi.number().integer().min(1).max(512).default(24),
  /**
   * `audience_resolution` 且多目标直连时，若用户未 @ CEO，是否从 summon 列表中移除 CEO（默认 true）。
   */
  COLLAB_MAIN_ROOM_AUDIENCE_SUMMON_STRIP_CEO: Joi.boolean().default(true),
  /** 阶段 5：主群受众路由允许高相关专员（非总监）自然接话。 */
  COLLAB_MAIN_ROOM_AUDIENCE_EMPLOYEE_NATURAL_ENABLED: Joi.boolean().default(true),
  /** 阶段 5：单轮最多允许多少位专员直连（总监不受此限，仍受 MAX_DIRECT_TARGETS 约束）。 */
  COLLAB_MAIN_ROOM_AUDIENCE_EMPLOYEE_NATURAL_MAX: Joi.number().integer().min(0).max(8).default(2),
  /** 阶段 5：LLM 受众路由置信度低于此值时不自动放行专员（@ 提及除外）。 */
  COLLAB_MAIN_ROOM_AUDIENCE_EMPLOYEE_NATURAL_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.78),
  /** 阶段 7：`appendAgent` / patchMetadata 重试次数（含首次，至少 1）。 */
  COLLAB_MAIN_ROOM_APPEND_AGENT_RETRY_ATTEMPTS: Joi.number().integer().min(1).max(5).default(3),
  /**
   * 多目标直连时是否将服务端写入的 unified `userFacingReply` 中「请依次介绍」类主持话术弱化为短确认（默认 true）。
   */
  COLLAB_MAIN_ROOM_MULTI_DIRECT_SANITIZE_USER_FACING: Joi.boolean().default(true),
  /** 2026.2：主群 Intent 主管解析与记忆 hits 对齐时仅打日志，不改变路由（影子）。 */
  MAIN_ROOM_INTENT_DIRECTOR_MEMORY_SHADOW: Joi.boolean().default(false),
  /** 2026.2：主群 quick/simple 在满足置信度时用 unified 内服务端填充的 userFacingReply 由 CEO 单条直答（早于 early exit）。 */
  MAIN_ROOM_INTENT_INLINE_REPLY_ENABLED: Joi.boolean().default(false),
  /** 与 MAIN_ROOM_INTENT_INLINE_REPLY_ENABLED 联用；低于则不走 Intent 直答。 */
  MAIN_ROOM_INTENT_INLINE_REPLY_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.88),
  /**
   * 主群 CEO `ceo.natural_reply` / fast_path 是否注入「最近对话节选」（与直连 transcript 同源 RPC）。
   * 解决用户追问「刚才说了什么」「上下文」时仅见记忆、不见当轮前文的问题。
   */
  CEO_REPLAY_INJECT_RECENT_TRANSCRIPT: Joi.boolean().default(true),
  /**
   * CEO replay / natural_reply 使用的「最近对话节选」正文预算（`clipText` 上限，不含标题行）。
   * IntentLayer 独立 digest 仍受 `buildRecentRoomTranscriptDigest` 默认约束时可另行调参。
   */
  CEO_REPLAY_RECENT_TRANSCRIPT_MAX_BODY_CHARS: Joi.number().integer().min(800).max(16000).default(4200),
  /**
   * 主群 replay 委托是否走 canonical 工具（`memory.search` / `facts.company.query`）+ 末轮 JSON。
   * 默认 true；false 为紧急回滚到大包预取且无工具轮。
   */
  CEO_REPLAY_TOOLS_ENABLED: Joi.boolean().default(true),
  /** replay 工具阶段最大轮次（每轮可含多次 tool_call）。 */
  CEO_REPLAY_TOOLS_MAX_ROUNDS: Joi.number().integer().min(1).max(8).default(3),
  /** 每轮最多处理的 tool_call 数。 */
  CEO_REPLAY_TOOLS_MAX_CALLS_PER_ROUND: Joi.number().integer().min(1).max(5).default(5),
  /** 启用工具时 LLM 超时 = 基础毫秒 × 该倍数（再受 CAP 封顶）。 */
  CEO_REPLAY_TOOLS_TIMEOUT_MULTIPLIER: Joi.number().min(1).max(6).default(2),
  CEO_REPLAY_TOOLS_TIMEOUT_MS_CAP: Joi.number().integer().min(10_000).max(120_000).default(45_000),
  /** 主群 CEO 回复前是否启用 Context Grounding Planner（LLM 按需决定预取块）。 */
  CEO_CONTEXT_GROUNDING_PLANNER_ENABLED: Joi.boolean().default(true),
  /**
   * 主群 replay 事实层模式：`minimal_tools`（默认，极小保底 + 工具/Planner 按需）或 `full_prefetch`（紧急回滚）。
   */
  CEO_REPLAY_FACT_LAYER_MODE: Joi.string().valid('minimal_tools', 'full_prefetch').default('minimal_tools'),
  /**
   * 主群前置受众路由（IntentLayer）是否在 userTurn JSON 中附带 `recentTranscriptDigest`（同源 RPC，**受众路由版**含人类+agent 行且 agent 强截断）。
   * 用于多轮指代与对话流（如用户抱怨只有个别人说话）；与 CEO replay 全量节选策略不同。
   */
  MAIN_ROOM_INTENT_INJECT_RECENT_TRANSCRIPT: Joi.boolean().default(true),
  /**
   * 是否在 CEO 治理入口把 `buildGovernanceAck` 前缀拼入 `fastFinalText`（用户可见）。
   * 默认 false：仅模型/下游自然输出；true 恢复旧版「治理受理」前缀。
   */
  COLLAB_GOVERNANCE_ACK_VISIBLE: Joi.boolean().default(false),
  /**
   * 部门群 Director 回复是否走 IntentLayer + 与主群一致的 `generateDirectedAgentReply` 模型路径（默认关闭为骨架文案）。
   */
  COLLAB_DEPT_DIRECTOR_MODEL_ENABLED: Joi.boolean().default(true),
  /**
   * Phase 3.5：单职务高置信直连时跳过 CEO 编排链路，由目标 Agent 快速 handover（仍异步写 Memory handover 观测）。
   */
  DIRECT_AGENT_FAST_HANDOVER_ENABLED: Joi.boolean().default(true),
  /** 主群直聊是否将被 @ Agent 的 effective Skill 暴露为 LLM tools（默认开启）。 */
  COLLAB_DIRECT_AGENT_SKILLS_ENABLED: Joi.boolean().default(true),
  /** 直聊 Skill tool loop 最大轮次（非 fast handover）。 */
  COLLAB_DIRECT_AGENT_SKILLS_MAX_ROUNDS: Joi.number().integer().min(1).max(8).default(3),
  /** 直聊 fast handover Skill tool loop 最大轮次。 */
  COLLAB_DIRECT_AGENT_SKILLS_FAST_MAX_ROUNDS: Joi.number().integer().min(1).max(8).default(2),
  /** 直聊每轮最多处理的 tool_call 数（非 fast）。 */
  COLLAB_DIRECT_AGENT_SKILLS_MAX_CALLS_PER_ROUND: Joi.number().integer().min(1).max(8).default(4),
  /** 直聊 fast handover 每轮最多处理的 tool_call 数。 */
  COLLAB_DIRECT_AGENT_SKILLS_FAST_MAX_CALLS_PER_ROUND: Joi.number().integer().min(1).max(8).default(2),
  /**
   * 直聊调用 prompt 类 Skill 时的展开模式：空=fast 用 auto、非 fast 用 complete；auto=仅返回指令 payload；complete=Skill 内 LLM 产出。
   */
  COLLAB_DIRECT_AGENT_SKILLS_PROMPT_MODE: Joi.string().valid('auto', 'complete').allow('').default(''),
  /**
   * 审批策略：`normal` 仅高风险/高成本+高意图等关键路径建单；`strict` 保留更宽的自动 needsHumanApproval 规则。
   */
  COLLAB_APPROVAL_STRICT_LEVEL: Joi.string().valid('normal', 'strict').default('normal'),
  /**
   * PR5/W4：协作 LLM 统一 Token 计量并上报 billing.consumption → billing.record（CEO 路径 isNominal）。
   * false 时恢复旧行为（CEO 不包装计量中间件；依赖 ALS 的员工路径仍可能不入账）。
   */
  COLLAB_LLM_METERING_ENABLED: Joi.boolean().default(true),
  /**
   * W4：协作 Memory 横切启用 session → department → company 分层命名空间（检索 + 沉淀）。
   * false 时仅保留原有 collaboration:* / room 汇总路径。
   */
  COLLAB_MEMORY_LAYERING_ENABLED: Joi.boolean().default(true),
  /**
   * 为单条消息发布一次 `collaboration.execution.lifecycle.v1`（含完整 stages 数组），替代多次 `state_changed.v2`。
   */
  COLLAB_EXECUTION_LIFECYCLE_SINGLE_EVENT: Joi.boolean().default(true),
  /**
   * 与 lifecycle.v1 并存时，仍按阶段发布 `collaboration.execution.state_changed.v2`（迁移/双写）。
   */
  COLLAB_EXECUTION_STATE_LEGACY_PER_STAGE: Joi.boolean().default(false),
  /**
   * Phase 3.6：同一 trace（单条消息生命周期）内 Memory Graph 检索去重，后续 auxiliary / Direct Agent 复用 lead `retrieveBeforeIntent` 命中。
   */
  MEMORY_RETRIEVAL_DEDUPLICATION_ENABLED: Joi.boolean().default(true),
  /**
   * Phase 3.6：在进程内 Map 之外，将 lead 检索结果写入 Redis（`memory:trace:${traceId}`），便于多 worker 共享。
   * 默认开启；未配置 REDIS_URL 时写入/读取会静默失败，行为退化为仅进程内缓存。
   */
  MEMORY_RETRIEVAL_LEAD_REDIS_CACHE_ENABLED: Joi.boolean().default(true),
  /** Phase 3.6：Redis lead 缓存 TTL（毫秒），默认 30s。 */
  MEMORY_RETRIEVAL_LEAD_REDIS_TTL_MS: Joi.number().integer().min(1000).max(120_000).default(30_000),
  /**
   * P0：主群编排层已移除「强制画像问卷」拼接；本开关用于 quick 路径编排策略与直聊 auxiliary hint 的额外收敛。
   * 公司级 @ / summon 在代码层恒为对话优先；CompanyBrain 缺口 LLM 仅在 routePath=orchestration 且非 quick/summon 路径时执行。
   */
  COLLAB_PROFILE_FOLLOWUP_SUPPRESS_QUICK: Joi.boolean().default(true),
  /**
   * Intent 2026.1：主群 unified 路径下是否允许将 L1 pre-context 写入 planning metadata（全局默认）。
   * 设为 false 可紧急关闭；单公司可用 `runtime_preferences.collaboration.intent20261PlanningEnrichEnabled` 覆盖。
   */
  COLLAB_INTENT_2026_1_FORCE_ENABLED: Joi.boolean().default(true),
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
  /** L1 classifier：向 Human 注入身份/向量摘要的最大字符数；0=关闭（默认） */
  WORKER_COLLAB_CLASSIFIER_CONTEXT_MAX_CHARS: Joi.number().integer().min(0).max(4000).default(1200),
  /** L1 Human 中 `roomAgentRoster` 构建结果进程内缓存 TTL（毫秒）；0=关闭 */
  WORKER_COLLAB_ROSTER_CACHE_TTL_MS: Joi.number().integer().min(0).max(600000).default(60000),
  /** Worker → API `agents.findAll` 的 pageSize；须 ≤ API `QueryAgentsDto` @Max（默认 100，最大 500） */
  AGENTS_ACTIVE_DIRECTORY_PAGE_SIZE: Joi.number().integer().min(1).max(500).default(100),
  /** L1 分类决策进程内缓存 TTL（毫秒）；0=关闭（默认，避免路由漂移） */
  WORKER_COLLAB_L1_CLASSIFIER_CACHE_TTL_MS: Joi.number().integer().min(0).max(300000).default(0),
  /** L1 重构总开关（默认关闭；可被公司级配置覆盖） */
  WORKER_L1_REFACTOR_ENABLED: Joi.boolean().default(true),
  /** L1 分类 Prompt 版本（默认 exact；可被公司级配置覆盖） */
  L1_PROMPT_VERSION: Joi.string().valid('v2.1-exact', 'v2.1-creative').default('v2.1-exact'),
  /** L1 预测式 MoE 开关（默认关闭；可被公司级配置覆盖） */
  L1_PREDICTIVE_MOE_ENABLED: Joi.boolean().default(false),
  /** W5：LangGraph 动态子图 + hierarchicalExpand 增强（默认关闭） */
  /** W9 / Phase 3：主管自主子图 bundle；与 collaboration-main-chain.env.example 一并开启验收 */
  MULTI_AGENT_GRAPH_V2_ENABLED: Joi.boolean().default(true),
  /** W11：跨部门 L2 Graph 协调（须与 MULTI_AGENT_GRAPH_V2 及公司级 Flag 联用）；默认关闭 */
  CROSS_DEPARTMENT_COORDINATION_ENABLED: Joi.boolean().default(false),
  /**
   * W14：成本感知路由（taskPriority → ModelRouter；默认关闭）。
   * 与 L1 `costAwareRoutingEnabled` + 灰度共同门控。
   */
  COST_AWARE_ROUTING_ENABLED: Joi.boolean().default(false),
  /** 公司预算利用率 ≥ 该阈值（0–1）时倾向降级 cheaper 模型 / low priority */
  COST_AWARE_BUDGET_THRESHOLD: Joi.number().min(0).max(1).default(0.82),
  /** 0–100：在全局开关 + L1 打开后，按公司 id 哈希灰度 */
  COST_AWARE_ROLLOUT_PERCENT: Joi.number().integer().min(0).max(100).default(0),
  COST_AWARE_ROLLOUT_WHITELIST_COMPANY_IDS: Joi.string().allow('').optional(),
  /**
   * W7 / Phase 3：部门 Director 自主（L2 下发拆工、`collaboration.task-delegation.requested`）。
   * 预发模板见 docs/deployment/collaboration-main-chain.env.example
   */
  DIRECTOR_AUTONOMOUS_ENABLED: Joi.boolean().default(true),
  /**
   * W7 / Phase 3：员工 Agent 自主（employee.task.propose、Pending 执行）。
   * 与 DIRECTOR_AUTONOMOUS、MULTI_AGENT_GRAPH_V2 及 L1 公司灰度一并验收。
   */
  EMPLOYEE_AUTONOMOUS_ENABLED: Joi.boolean().default(true),
  /** W7/W12：领域事件总线 V2（出站 domain / 入站 chat.ingested.v2；无 legacy 双写）；默认关闭 */
  AUTONOMOUS_EVENT_BUS_V2_ENABLED: Joi.boolean().default(false),
  /** W8：Phase1 功能统一灰度百分比（公司未显式覆盖 env 时，在「全局开关已开」前提下按公司 id 哈希命中）；默认 10 */
  PHASE1_ROLLOUT_PERCENT: Joi.number().integer().min(0).max(100).default(10),
  /** W8：逗号分隔 companyId 白名单，跳过灰度直接视为命中 */
  PHASE1_ROLLOUT_WHITELIST_COMPANY_IDS: Joi.string().allow('').optional(),
  /** W12：Phase2 自主 Bundle 灰度（观测 / 与 Phase1 独立；默认 0=仅白名单） */
  PHASE2_ROLLOUT_PERCENT: Joi.number().integer().min(0).max(100).default(0),
  PHASE2_ROLLOUT_WHITELIST_COMPANY_IDS: Joi.string().allow('').optional(),
  /** W16：Phase3 全量渐进总闸（默认关闭；与各子特性 env 独立；白名单 / 百分比 / `?ff=phase3_bundle`） */
  PHASE3_ROLLOUT_ENABLED: Joi.boolean().default(false),
  PHASE3_ROLLOUT_PERCENT: Joi.number().integer().min(0).max(100).default(0),
  PHASE3_ROLLOUT_WHITELIST_COMPANY_IDS: Joi.string().allow('').optional(),
  /** W13：Memory Graph V2（须与 API 公司级 rollout 一致）；默认关闭 */
  MEMORY_GRAPH_V2_ENABLED: Joi.boolean().default(false),
  MEMORY_GRAPH_V2_ROLLOUT_PERCENT: Joi.number().integer().min(0).max(100).default(100),
  MEMORY_GRAPH_V2_ROLLOUT_WHITELIST_COMPANY_IDS: Joi.string().allow('').optional(),
  /**
   * Phase3-final：`simple_query` 时编排层仅保留 memory.search（禁用 facts / department 工具），与 Memory Cortex 对齐。
   * 设为 false 可恢复旧「事实工具可选」行为。
   */
  FORCE_MEMORY_CORTEX_ONLY: Joi.boolean().default(true),
  /** L1 PreContext 开关（默认关闭；可被公司级配置覆盖） */
  L1_PRECONTEXT_ENABLED: Joi.boolean().default(false),
  /** L1 Temporal 预热开关（默认关闭；可被公司级配置覆盖） */
  L1_TEMPORAL_PREWARM_ENABLED: Joi.boolean().default(false),
  /** L3 Temporal 重构 Step 1: 协议对齐（默认关闭；保留旧调用路径） */
  WORKER_L3_TEMPORAL_PROTOCOL_ALIGN_ENABLED: Joi.boolean().default(false),
  /** L3 Temporal 重构 Step 2: Durable Execution 底座（默认关闭；完全兼容旧 Redis Stream 路径） */
  WORKER_L3_TEMPORAL_V1: Joi.boolean().default(false),
  /** L3 Temporal 重构 Step 7: 灰度发布百分比（0-100） */
  L3_TEMPORAL_ROLLOUT_PERCENTAGE: Joi.number().integer().min(0).max(100).default(0),
  /** 主群 task_publish：Markdown Dispatch Plan → Compiler → auto flush（默认 false 灰度） */
  COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED: Joi.boolean().default(true),
  /** 主群 Collaboration Program SSOT（自然语言交付 → 自动编排派发） */
  COLLAB_PROGRAM_SSOT_ENABLED: Joi.boolean().default(true),
  /** Program brief 齐备后：auto=直接 planning；always=停 pending_confirm */
  COLLAB_PROGRAM_CONFIRM_MODE: Joi.string().valid('auto', 'always').default('auto'),
  /**
   * @deprecated 将在下个 sprint 移除此配置和相关代码路径。默认 false，legacy 分支已是死代码。
   * Program SSOT 开启时是否允许回退 legacy post-intent 路由
   */
  COLLAB_PROGRAM_LEGACY_ROUTER_FALLBACK: Joi.boolean().default(false),
  /** Phase 12：Work Intent Compiler（执行触发 SSOT） */
  COLLAB_WORK_INTENT_COMPILER_ENABLED: Joi.boolean().default(true),
  /** Phase 13：Program Redis timeline 写入 */
  COLLAB_PROGRAM_TIMELINE_ENABLED: Joi.boolean().default(true),
  /** Phase 15：Program SSOT 时跳过 legacy alignment/draft session 双写 */
  COLLAB_PROGRAM_SESSION_PROJECTION_ONLY: Joi.boolean().default(false),
  /** 主群 CEO Turn Tool-First（collaboration.orchestrate 唯一派发副作用） */
  COLLAB_TURN_TOOL_ORCHESTRATION_ENABLED: Joi.boolean().default(true),
  /** Phase 1：Agent 工具循环（替代 replay delegate → authorization → dispatch 流程） */
  COLLAB_AGENT_TOOL_LOOP_ENABLED: Joi.boolean().default(true),
  /** Phase 2：`tool.ask_colleague` 同步跨 Agent 工具（默认关闭，安全灰度） */
  ASK_COLLEAGUE_TOOL_ENABLED: Joi.boolean().default(false),
  /** `tool.ask_colleague` 最大递归深度（默认 2：user→A→B） */
  ASK_COLLEAGUE_MAX_DEPTH: Joi.number().integer().min(1).max(5).default(2),
  /** `tool.ask_colleague` 顶层超时（毫秒），传播至所有嵌套调用 */
  ASK_COLLEAGUE_TIMEOUT_MS: Joi.number().integer().min(5_000).max(120_000).default(45_000),
  /** Dispatch Plan 编译成功后的下发门闸：auto=立即 flush；confirm=写入 pending 待用户确认 */
  COLLAB_DISPATCH_CONFIRM_MODE: Joi.string().valid('auto', 'confirm').default('auto'),
  /** UUID thread 读协作 Redis 会话时不回退 main */
  COLLAB_STRICT_THREAD_ISOLATION: Joi.boolean().default(true),
  /**
   * 主群编排完成路径强制 HTTP 内联监督（不走 Temporal Heavy 灰度）。
   * 默认 true，避免异步监督与分工草稿会话竞态。
   */
  COLLAB_MAIN_ROOM_FORCE_INLINE_SUPERVISION: Joi.boolean().default(true),
  /** 主群：部门子目标 assign 成功后 CEO 逐条 @ 派活（短句；Plan 卡片单独一条） */
  MAIN_ROOM_DISPATCH_CHAT_MESSAGES_ENABLED: Joi.boolean().default(true),
  /** 主群：主管部门汇报后 CEO 是否简短转发进展 */
  MAIN_ROOM_DEPT_PROGRESS_RELAY_ENABLED: Joi.boolean().default(true),
  /**
   * 主群：派发是否尊重 DistributionPlan.tasks[].dependencies（默认 true：按依赖分波派发）。
   * false 时 flush 首轮尽量一次派发（旧行为，仅建议排障或兼容期临时关闭）。
   */
  MAIN_ROOM_DISPATCH_RESPECT_DEPENDENCIES: Joi.boolean().default(true),
  /** 主群：编排派发的部门子目标全部 completed 后是否在主群 appendAgent 一条 CEO 总结 */
  MAIN_ROOM_DISTRIBUTION_COMPLETION_SUMMARY_ENABLED: Joi.boolean().default(true),
  /**
   * Supervision 输入：`dept_reports` 读主管部门汇报；`inline_skill` 走 EmployeeExecutionService 内联执行（降级）。
   */
  COLLAB_SUPERVISION_INPUT_MODE: Joi.string()
    .valid('dept_reports', 'inline_skill')
    .default('inline_skill'),
  /** L2 自动结案：主管部门汇报 readyForSupervision 时须含可验收 artifact（默认 true） */
  COLLAB_L2_AUTO_COMPLETE_REQUIRE_DELIVERABLE: Joi.boolean().default(true),
  /** L2 结案：须收齐全部委派员工汇报后才 readyForSupervision（默认 true，防竞态提前结案） */
  COLLAB_L2_REQUIRE_ALL_DELEGATIONS: Joi.boolean().default(true),
  /** 部门群对话模式（默认 true）：关闭任务镜像/tool_call/监督汇报/系统派单卡等噪音写入聊天 */
  COLLAB_DEPT_CHAT_CONVERSATIONAL_MODE: Joi.boolean().default(true),
  /** 任务 created/progress/completed 镜像进部门群（默认 false） */
  COLLAB_DEPT_TASK_STAGE_CHAT_ENABLED: Joi.boolean().default(false),
  /** 员工 Skill 执行前 tool_call 消息进部门群（默认 false） */
  COLLAB_DEPT_SKILL_TOOL_CALL_CHAT_ENABLED: Joi.boolean().default(false),
  /** readyForSupervision 时在部门群写 director_dept_report_summary（默认 false） */
  COLLAB_DEPT_SUPERVISION_REPORT_IN_ROOM_ENABLED: Joi.boolean().default(false),
  /** L2 派发时写【部门任务下发】系统卡（默认 false；thread+metadata 仍创建） */
  COLLAB_DEPT_DISPATCH_SYSTEM_CARD_ENABLED: Joi.boolean().default(false),
  /** 员工 @ 主管 时在部门群写机器 ack（默认 false） */
  COLLAB_DEPT_EMPLOYEE_COLLAB_ACK_CHAT_ENABLED: Joi.boolean().default(false),
  /**
   * 主群：Replay 细化（invoke=false）且存在 draftGoalSummary 时，尝试 RPC 同步进战略目标 Redis 草稿。
   * 默认关闭；开启后以「主目标=摘要全文 + 单条 KR」方式写入，避免幻觉结构化。
   */
  MAIN_ROOM_REPLAY_PATCH_STRATEGY_DRAFT_FROM_SUMMARY_ENABLED: Joi.boolean().default(false),
  /** 阶段 4：主群编排暂停/撤回（老板打断进行中编排）。 */
  COLLAB_MAIN_ROOM_ORCHESTRATION_PAUSE_ENABLED: Joi.boolean().default(true),
  /** 主群 Replay 执行模式轻答：优先 natural_reply 生成 surface（delegate JSON 仍提供 draft）。 */
  COLLAB_MAIN_ROOM_REPLAY_NATURAL_LIGHT_REPLY: Joi.boolean().default(false),
  /** 阶段 2：主群先即时接话、后跑重编排（默认开）。异常可关回「编排阻塞在前」。 */
  COLLAB_MAIN_ROOM_REPLY_BEFORE_HEAVY: Joi.boolean().default(true),
  /** 阶段 3：主群路由 SSOT 收敛（earlyRoute 统一分发；默认开则 ceo 线走 post-intent 而非 turn-tool 旁路）。 */
  COLLAB_MAIN_ROOM_ROUTE_SSOT_CONVERGED: Joi.boolean().default(true),
  /** Phase 2：主群 Replay SSOT — Worker 发 collaboration.replay.delegate.completed，API 跳过同步规则决策。 */
  COLLAB_MAIN_ROOM_REPLAY_SSOT_PHASE2: Joi.boolean().default(true),
  /** Phase 4：Strategy 规划画像 — unified（默认）| deliverable_bias（task_publish/文档类偏交付物里程碑） */
  STRATEGY_PLANNING_PROFILE_MODE: Joi.string().valid('unified', 'deliverable_bias').default('unified'),
  /**
   * 主群重度协作管线进行时（strategy→orchestration→supervision）写入 Redis 租约，自治 CEO LangGraph 心跳让路。
   * 无 REDIS_URL 时租约无效（不显式阻断心跳）。
   */
  COLLAB_SESSION_LEASE_ENABLED: Joi.boolean().default(true),
  /** 会话租约 TTL（毫秒）；应覆盖定稿→编排→监督的 P99 耗时 */
  COLLAB_SESSION_LEASE_TTL_MS: Joi.number().integer().min(5000).max(900_000).default(240_000),
  /** 仅发布 collaboration.intent.classified.v2026_1（关闭 legacy v2 双写） */
  COLLAB_INTENT_SINGLE_PUBLISH_V20261: Joi.boolean().default(false),
  /** 群聊接话人「正在思考」WS 事件（responder:thinking） */
  COLLAB_RESPONDER_THINKING_ENABLED: Joi.boolean().default(true),
  /** retrieveBeforeIntent 后写入统一 retrieval 元数据（2026.v2 计划器） */
  COLLAB_RETRIEVAL_PLANNER_V2_ENABLED: Joi.boolean().default(true),
  /** 指派对齐部门职责规则（营销/增长类不得落 HR 等） */
  COLLAB_ASSIGNMENT_VALIDATOR_ENABLED: Joi.boolean().default(true),
  /** RoomContext 全量缓存 TTL；0=关闭。缓存在主群单轮多阶段 buildRoomContext 时降低 RPC 突发 */
  COLLAB_ORG_SNAPSHOT_ROOM_CONTEXT_CACHE_TTL_MS: Joi.number().integer().min(0).max(120_000).default(12_000),
  /** 编排分发阶段：工具已注入但 0 次调用的处置 */
  COLLAB_DISTRIBUTE_TOOLS_ENFORCE_MODE: Joi.string().valid('off', 'warn', 'fail').default('warn'),
  /** true：CEO 路由也使用成员 Agent 固定 LLM Key（默认 false 保持按层池解析） */
  COLLAB_CEO_RESPECTS_AGENT_FIXED_LLM_KEY: Joi.boolean().default(false),
  /** 监督内联前先发短确认气泡，再返回完整 supervision 正文（两段 appendAgent） */
  COLLAB_SUPERVISION_SPLIT_ENABLED: Joi.boolean().default(false),
  /** CEO orchestration distribute LLM 超时（毫秒）；未设置则沿用内部默认 */
  CEO_ORCHESTRATION_DISTRIBUTE_LLM_TIMEOUT_MS: Joi.number().integer().min(5000).max(300_000).optional(),
  CEO_ORCHESTRATION_DISTRIBUTE_MAX_OUTPUT_TOKENS: Joi.number().integer().min(256).max(8192).optional(),
  /**
   * 主群会话型监督回复：`short_confirm` 倾向短确认；`memory_cortex_summary` 保留长摘要轮廓（仍受 Memory Graph/Cortex 门控）
   */
  COLLAB_SUPERVISION_CONVERSATIONAL_PROFILE: Joi.string().valid('short_confirm', 'memory_cortex_summary').default('short_confirm'),
  /** L3 Temporal 重构 Step 7: 公司白名单（逗号分隔 companyId） */
  L3_TEMPORAL_ROLLOUT_COMPANIES: Joi.string().allow('').default(''),
  /** Temporal server address，例如 localhost:7233 */
  TEMPORAL_ADDRESS: Joi.string().default('localhost:7233'),
  /** Temporal namespace，默认 default */
  TEMPORAL_NAMESPACE: Joi.string().default('default'),
  /** L3 CEO Heavy Temporal task queue */
  TEMPORAL_CEO_HEAVY_TASK_QUEUE: Joi.string().default('ceo-heavy-task-queue'),
  CEO_LLM_PREP_CACHE_ENABLED: Joi.boolean().default(false),
  CEO_LLM_PREP_CACHE_TTL_MS: Joi.number().integer().min(1000).max(600000).default(20000),
  L2_REPLY_FACTS_CACHE_TTL_MS: Joi.number().integer().min(0).max(600000).default(60000),
  L2_REPLY_CACHE_TTL_MS: Joi.number().integer().min(0).max(600000).default(30000),
  CEO_PRELOAD_ENABLED: Joi.boolean().default(false),
  CEO_PRELOAD_PREFETCH: Joi.number().integer().min(1).max(200).default(10),
  CEO_PRELOAD_MAX_CONCURRENCY: Joi.number().integer().min(1).max(200).default(15),
  CEO_PRELOAD_COOLDOWN_MS: Joi.number().integer().min(1000).max(600000).default(30000),
  /** Phase 3.5：自治 LangGraph plan 后 Early-Exit 自信决策（默认开启） */
  CEO_EARLY_EXIT_ENABLED: Joi.boolean().default(true),
  /** 协作主群 CEO replay 进程级开关（未设置时继承 `CEO_USER_SURFACE_ENABLED` → `CEO_EARLY_EXIT_ENABLED`） */
  CEO_REPLAY_ENABLED: Joi.boolean().optional(),
  /** 协作主群 CEO 面向用户层进程级开关（未设置时继承 `CEO_EARLY_EXIT_ENABLED`）；优先使用 `CEO_REPLAY_ENABLED` */
  CEO_USER_SURFACE_ENABLED: Joi.boolean().optional(),
  /** Phase 3.5：Early-Exit 命中所需最小置信度（0–1） */
  EARLY_EXIT_CONFIDENCE_THRESHOLD: Joi.number().min(0).max(1).default(0.92),
  /** 协作主群 CEO replay 记忆置信阈值（未设置时继承 `CEO_USER_SURFACE_MEMORY_THRESHOLD` → `EARLY_EXIT_CONFIDENCE_THRESHOLD`） */
  CEO_REPLAY_MEMORY_THRESHOLD: Joi.number().min(0).max(1).optional(),
  /** 主群 natural replay 默认模型名（可被 `strategy.contextPolicy.replay.modelName` 覆盖） */
  CEO_REPLAY_MODEL_NAME: Joi.string().max(200).default('glm-4-flash'),
  /** 协作主群 CEO 用户面记忆置信阈值（过渡期）；优先使用 `CEO_REPLAY_MEMORY_THRESHOLD` */
  CEO_USER_SURFACE_MEMORY_THRESHOLD: Joi.number().min(0).max(1).optional(),
  CEO_CLASSIFIER_TIMEOUT_MS: Joi.number().integer().min(100).max(120000).default(400),
  CEO_LIGHT_TIMEOUT_MS: Joi.number().integer().min(200).max(180000).default(2500),
  CEO_LIGHT_PRIMARY_TIMEOUT_MS: Joi.number().integer().min(500).max(180000).default(45000),
  CEO_LIGHT_FALLBACK_TIMEOUT_MS: Joi.number().integer().min(500).max(180000).default(30000),
  CEO_HEAVY_HYBRID_TIMEOUT_MS: Joi.number().integer().min(5000).max(300000).default(120000),
  CEO_HEAVY_TIMEOUT_MS: Joi.number().integer().min(500).max(600000).default(12000),
  /** Heavy enqueue 幂等窗口（毫秒） */
  ENQUEUE_IDEMPOTENCY_TTL_MS: Joi.number().integer().min(1000).max(3600000).default(600000),
  /** 高于此置信度的启发式结果将跳过 CEO LLM */
  CEO_DECISION_HEURISTIC_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.85),
  /** CEO 决策后是否回写 collaboration.rooms.collaborationMode（供前端只读展示） */
  CEO_DECISION_SYNC_ROOM_MODE: Joi.boolean().default(true),
  /**
   * 群聊流水线：requiresHumanApproval 时在 LangGraph 内 interrupt，下一条用户消息 Command.resume。
   * false 时仅发房间提示，不暂停图（无 checkpoint 需求时也可用）。
   */
  CEO_ROOM_APPROVAL_INTERRUPT_ENABLED: Joi.boolean().default(true),
  /** goal_draft 审批通过后自动 kickoff 是否静默进入 Heavy（仅一次确认消息） */
  GOAL_DRAFT_AUTO_KICKOFF_SILENT: Joi.boolean().default(true),
  /** 审批通过后是否强制 L2 / degrade / fallback 进入静默模式 */
  POST_APPROVAL_SILENT_MODE: Joi.boolean().default(false),
  /** 审批通过后是否发送单条干净确认消息 */
  HEAVY_CONFIRM_MESSAGE_POST_APPROVAL: Joi.boolean().default(true),
  /** Heavy 状态机驱动执行开关（默认关闭，需显式开启） */
  FOUNDRY_HEAVY_STATE_MACHINE_ENABLED: Joi.boolean().default(true),
  /** splitting 子阶段超时（毫秒） */
  FOUNDRY_HEAVY_SPLITTNG_TIMEOUT_MS: Joi.number().integer().min(5000).max(300000).default(60000),
  /** partial merge 后强制 structured 降级，避免仅 diagnostic 文案 */
  FOUNDRY_HEAVY_FORCE_STRUCTURED_ON_PARTIAL_MERGE: Joi.boolean().default(true),
  /** L3 splitting 调试：记录 planner 原始输出预览（默认关闭，避免日志过长） */
  FOUNDRY_CEO_HEAVY_PLANNER_RAW_LOGGING_ENABLED: Joi.boolean().default(false),
  /** 讨论控场：本轮建议最大并行发言人数上限（与 CEO JSON 取较小值） */
  DISCUSSION_MODERATION_MAX_SPEAKERS: Joi.number().integer().min(1).max(8).default(4),
  /** Direct 模式 Agent 回复用模型 */
  WORKER_COLLAB_DIRECT_MODEL: Joi.string().allow('').default(''),
  /**
   * CEO/Agent 直聊注入的近期房间消息条数（人机交替计条数，0=关闭多轮上下文）。
   * 仅同 room；有 threadId 时只带该线程内消息，否则只带主时间线（thread_id 为空）。
   */
  WORKER_COLLAB_DIRECT_HISTORY_LIMIT: Joi.number().integer().min(0).max(100).default(8),
  /** 群聊直聊/纪要是否对当前用户句做 memory.search（分层检索） */
  WORKER_GROUP_CHAT_MEMORY_RETRIEVAL: Joi.boolean().default(true),
  WORKER_GROUP_CHAT_MEMORY_TOP_K: Joi.number().integer().min(1).max(24).default(8),
  WORKER_GROUP_CHAT_DIGEST_TRANSCRIPT_LIMIT: Joi.number().integer().min(10).max(200).default(40),
  /**
   * P2.2：主群显式召唤（`direct_summon`，执行层 routePath 仍为 direct_agent/direct_group）时，Direct Reply 层是否默认注入公司画像（memory.companyProfile）。
   * 默认 true；单公司可经 runtime_preferences.collaboration 覆盖（见 CeoLayerConfigResolverService.getDirectAgentMemoryInjectConfig）。
   */
  WORKER_DIRECT_AGENT_DEFAULT_INJECT_COMPANY_PROFILE: Joi.boolean().default(true),
  /**
   * P2.2：同上，是否注入【最近对话】原文块（collaboration.messages.list）。
   * 默认 true。
   */
  WORKER_DIRECT_AGENT_DEFAULT_INJECT_RECENT_TRANSCRIPT: Joi.boolean().default(true),
  /** P2.2：最近对话块的消息条数上限（4–20）。默认 10。 */
  WORKER_DIRECT_AGENT_TRANSCRIPT_MESSAGE_COUNT: Joi.number().integer().min(4).max(20).default(10),
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
  /** G1: 是否把复盘短评发回群聊（默认 false，仍写入 memory；需要时环境变量打开） */
  WORKER_SUPERVISOR_POST_REVIEW_CHAT_ENABLED: Joi.boolean().default(false),
  /** G1: Supervisor 复盘专用模型（空则复用 WORKER_COLLAB_DIRECT_MODEL） */
  WORKER_SUPERVISOR_POST_REVIEW_MODEL: Joi.string().allow('').optional(),
  WORKER_SUPERVISOR_POST_REVIEW_LLM_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(12000),
  /** G1: 日报/周报聚合结果是否推送群聊简讯 */
  WORKER_SUPERVISOR_REVIEW_CHAT_SUMMARY_ENABLED: Joi.boolean().default(true),

  /** 仅开发环境：启用 file-read / code-run 占位 builtin（生产应保持 false） */
  WORKER_ALLOW_UNSAFE_SKILL_STUBS: Joi.boolean().default(false),

  /**
   * P12：Agent 任务执行 `code-run` 等 shell 技能前是否必须经 API `approval.createExecutionToken` 签发 `runner.exec` 令牌。
   * 默认 true；测试可设 false（仍须 Runner 策略链配合 mock 或显式传 token）。
   */
  FOUNDRY_CEO_REQUIRE_EXECUTION_TOKEN: Joi.boolean().default(true),

  /**
   * External HTTP Skill 执行白名单（逗号分隔 host 或 host:port）。
   * 示例：`api.internal,localhost:8080`
   */
  SKILL_HTTP_ALLOWLIST: Joi.string().allow('').default(''),
  /** External HTTP Skill 统一超时（毫秒） */
  SKILL_HTTP_TIMEOUT_MS: Joi.number().integer().min(1000).max(300000).default(15000),

  /**
   * Skill 渐进披露：工具列表 / Reply Facts 仅暴露 name+description；
   * 调用技能名时返回完整 promptTemplate（OpenClaw 对齐）。默认 true。
   */
  FOUNDRY_SKILL_PROGRESSIVE_DISCLOSURE: Joi.boolean().default(true),

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









