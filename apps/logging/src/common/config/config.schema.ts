import Joi from 'joi';

/**
 * Logging 服务配置验证模式
 */
export const configSchema = Joi.object({
  // 应用配置
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3001),
  HOSTNAME: Joi.string().optional(),

  // Loki 配置
  LOKI_URL: Joi.string().optional(),

  // Elasticsearch 配置
  // Allow empty string so docker env files can disable Elasticsearch explicitly.
  ELASTICSEARCH_URL: Joi.string().allow('').optional(),
  ELASTICSEARCH_INDEX_PREFIX: Joi.string().default('logs'),

  // 日志目录配置
  LOG_DIR: Joi.string().default('./logs'),

  // Consul 配置（可选）
  CONSUL_ENABLED: Joi.boolean().default(false),
  CONSUL_HOST: Joi.string().default('localhost'),
  CONSUL_PORT: Joi.number().default(8500),
  CONSUL_CONFIG_PREFIX: Joi.string().default('config/'),
  CONSUL_SECURE: Joi.boolean().default(false),
  CONSUL_TOKEN: Joi.string().optional(),
  CONSUL_DATACENTER: Joi.string().optional(),
});









