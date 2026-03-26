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

  // Consul 配置（可选）
  CONSUL_ENABLED: Joi.boolean().default(false),
  CONSUL_HOST: Joi.string().default('localhost'),
  CONSUL_PORT: Joi.number().default(8500),
  CONSUL_CONFIG_PREFIX: Joi.string().default('config/'),
  CONSUL_SECURE: Joi.boolean().default(false),
  CONSUL_TOKEN: Joi.string().optional(),
  CONSUL_DATACENTER: Joi.string().optional(),
});









