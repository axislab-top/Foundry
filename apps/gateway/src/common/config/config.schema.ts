import Joi from 'joi';

/**
 * 配置验证模式
 */
export const configSchema = Joi.object({
  // 应用配置
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3002),
  
  // JWT 配置
  JWT_SECRET: Joi.string()
    .required()
    .min(32)
    .pattern(/[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .messages({
      'string.min': 'JWT_SECRET must be at least 32 characters long',
      'string.pattern.base': 'JWT_SECRET must contain alphanumeric and special characters',
    }),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string()
    .required()
    .min(32)
    .pattern(/[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .messages({
      'string.min': 'JWT_REFRESH_SECRET must be at least 32 characters long',
      'string.pattern.base': 'JWT_REFRESH_SECRET must contain alphanumeric and special characters',
    }),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  
  // 数据库配置
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().default('postgres'),
  DB_DATABASE: Joi.string().default('gateway_db'),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  // 数据库 SSL 配置
  DB_SSL: Joi.boolean().default(false),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().default(true),
  // 数据库连接池配置
  DB_CONNECTION_TIMEOUT: Joi.number().default(10000),
  DB_QUERY_TIMEOUT: Joi.number().default(30000),
  DB_MAX_CONNECTIONS: Joi.number().default(20),
  DB_MIN_CONNECTIONS: Joi.number().default(2),
  // 数据库事务隔离级别
  DB_TRANSACTION_ISOLATION: Joi.string()
    .valid('READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE')
    .default('READ COMMITTED'),
  
  // 监控配置
  METRICS_ADAPTER: Joi.string()
    .valid('prometheus', 'statsd', 'console', 'noop')
    .default('prometheus'),
  METRICS_ENABLE_DEFAULT_COLLECTORS: Joi.boolean().default(true),
  PROMETHEUS_COLLECT_DEFAULT_METRICS: Joi.boolean().default(true),
  PROMETHEUS_PREFIX: Joi.string().optional(),
  
  // 防重放攻击配置
  REPLAY_ATTACK_TIME_WINDOW: Joi.number().default(300000), // 时间窗口（毫秒），默认5分钟
  REPLAY_ATTACK_ENABLED: Joi.boolean().default(true), // 是否启用防重放攻击
  
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
  /** 本地未起 Redis 时默认关闭协作 Pub/Sub，避免 ECONNRESET 刷屏；Docker 通过环境变量显式开启 */
  /** 与 API 对齐；false 时网关不订阅 Redis，agent/REST 落库消息无法经 WS 推送 */
  COLLAB_REDIS_NOTIFY: Joi.boolean().default(true),
  /** Socket.IO 专用 DB（仅在不使用 REDIS_URL 时生效） */
  SOCKET_IO_REDIS_DB: Joi.number().optional(),
  /** Socket.IO Redis Adapter：on/off/auto（默认 auto，连接失败可配合 FALLBACK） */
  SOCKET_IO_REDIS_ADAPTER: Joi.string()
    .valid('true', 'false', 'auto', 'on', 'off', '1', '0')
    .default('auto'),
  /** Redis Adapter 不可用时是否回退到内存（多实例生产环境建议 false） */
  SOCKET_IO_REDIS_ADAPTER_FALLBACK: Joi.boolean().default(true),
  
  // 服务地址配置
  API_SERVICE_URL: Joi.string().default('http://localhost:3000'),
  WEBHOOKS_SERVICE_URL: Joi.string().default('http://localhost:3003'),
  WORKER_SERVICE_URL: Joi.string().default('http://localhost:3004'),
  LOGGING_SERVICE_URL: Joi.string().default('http://localhost:3001'),
  
  // 限流配置
  RATE_LIMIT_TTL: Joi.number().default(60), // 限流时间窗口（秒）
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100), // 最大请求数
  RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS: Joi.boolean().default(false),
  
  // 超时配置
  HTTP_TIMEOUT: Joi.number().default(30000), // HTTP 请求超时（毫秒）
  /**
   * 网关 API/Webhooks RPC 每条路由 timeout 的下限（毫秒）。设为 0 可关闭。
   * 未设置时：非 production 默认 20000（避免前端长时间挂起）；production 为 0。
   */
  GATEWAY_API_RPC_MIN_TIMEOUT_MS: Joi.number().integer().min(0).max(300000).optional(),
  
  // 重试配置
  HTTP_RETRY_ENABLED: Joi.boolean().default(true), // 是否启用重试
  HTTP_RETRY_MAX_RETRIES: Joi.number().default(3), // 最大重试次数
  HTTP_RETRY_DELAY: Joi.number().default(1000), // 重试延迟（毫秒）
  HTTP_RETRY_STRATEGY: Joi.string().valid('fixed', 'exponential', 'linear').default('fixed'), // 重试策略
  HTTP_RETRY_MAX_DELAY: Joi.number().default(10000), // 最大重试延迟（毫秒）
  HTTP_RETRY_RETRYABLE_STATUS_CODES: Joi.string().default('500,502,503,504'), // 可重试的HTTP状态码
  HTTP_RETRY_RETRYABLE_ERRORS: Joi.string().default('ECONNABORTED,ETIMEDOUT,ECONNREFUSED,ENOTFOUND'), // 可重试的错误码
  
  // CORS 配置
  CORS_ORIGIN: Joi.string().default('*'),
  CORS_CREDENTIALS: Joi.boolean().default(true),
  
  // 断路器配置
  CIRCUIT_BREAKER_ENABLED: Joi.boolean().default(true), // 是否启用断路器
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: Joi.number().default(5), // 失败阈值（超过此值打开断路器）
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD: Joi.number().default(2), // 半开状态下的成功阈值
  CIRCUIT_BREAKER_TIMEOUT: Joi.number().default(60000), // 超时时间（毫秒）
  CIRCUIT_BREAKER_RESET_TIMEOUT: Joi.number().default(30000), // 重置超时（毫秒）
  
  // 追踪配置
  TRACING_ENABLED: Joi.boolean().default(false), // 是否启用追踪
  TRACING_SERVICE_NAME: Joi.string().default('gateway-service'), // 服务名称
  TRACING_SERVICE_VERSION: Joi.string().default('1.0.0'), // 服务版本
  TRACING_EXPORTER: Joi.string().valid('jaeger', 'zipkin', 'otlp', 'console', 'none').default('console'), // 导出器类型
  TRACING_JAEGER_ENDPOINT: Joi.string().optional(), // Jaeger 端点
  TRACING_ZIPKIN_ENDPOINT: Joi.string().optional(), // Zipkin 端点
  TRACING_OTLP_ENDPOINT: Joi.string().optional(), // OTLP 端点
  TRACING_OTLP_HEADERS: Joi.string().optional(), // OTLP 请求头 (key1=value1,key2=value2)
  TRACING_SAMPLING_RATE: Joi.number().min(0).max(1).default(1.0), // 采样率
  TRACING_ATTRIBUTES: Joi.string().optional(), // 属性 (key1=value1,key2=value2)
  
  // Swagger 配置
  SWAGGER_ENABLED: Joi.boolean().default(true), // 是否启用 Swagger（默认启用，生产环境建议禁用）
  SWAGGER_PATH: Joi.string().default('api-docs'), // Swagger UI 路径
});

