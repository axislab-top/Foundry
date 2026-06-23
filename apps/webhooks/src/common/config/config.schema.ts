import Joi from 'joi';

/**
 * Webhooks 服务配置验证模式
 */
export const configSchema = Joi.object({
  // 应用配置
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  WEBHOOKS_SERVICE_PORT: Joi.number().default(3003),
  APP_VERSION: Joi.string().optional(),

  // 数据库配置
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().default('postgres'),
  DB_DATABASE: Joi.string().default('service_db'),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  DB_SSL: Joi.boolean().default(false),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().default(true),
  DB_MAX_CONNECTIONS: Joi.number().default(20),
  DB_MIN_CONNECTIONS: Joi.number().default(2),
  DB_CONNECTION_TIMEOUT: Joi.number().default(10000),
  DB_QUERY_TIMEOUT: Joi.number().default(30000),

  // HTTP 配置
  HTTP_TIMEOUT: Joi.number().default(30000),
  // RMQ RPC 队列确认策略（Nest request/reply 推荐 noAck=true）
  WEBHOOKS_RMQ_RPC_NOACK: Joi.boolean().default(true),

  // Consul 配置（可选）
  CONSUL_ENABLED: Joi.boolean().default(false),
  CONSUL_HOST: Joi.string().default('localhost'),
  CONSUL_PORT: Joi.number().default(8500),
  CONSUL_CONFIG_PREFIX: Joi.string().default('config/'),
  CONSUL_SECURE: Joi.boolean().default(false),
  CONSUL_TOKEN: Joi.string().optional(),
  CONSUL_DATACENTER: Joi.string().optional(),
});









