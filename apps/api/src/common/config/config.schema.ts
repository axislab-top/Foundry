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

  // 监控配置
  METRICS_ADAPTER: Joi.string()
    .valid('prometheus', 'statsd', 'console', 'noop')
    .default('prometheus'),
  METRICS_ENABLED: Joi.boolean().default(true),
  PROMETHEUS_COLLECT_DEFAULT_METRICS: Joi.boolean().default(true),
  PROMETHEUS_PREFIX: Joi.string().default('api_service'),

  // HTTP 配置
  HTTP_TIMEOUT: Joi.number().default(30000), // HTTP 请求超时（毫秒）

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
  STORAGE_LOCAL_BASE_URL: Joi.string().default('/api/files'),

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
});








