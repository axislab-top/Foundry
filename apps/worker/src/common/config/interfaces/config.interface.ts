/**
 * 应用配置接口
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  version?: string;
}

/**
 * RabbitMQ 配置接口
 */
export interface RabbitMQConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  vhost: string;
  uri?: string;
  prefetchCount?: number;
  reconnectDelay?: number;
  maxRetries?: number;
}

/**
 * 完整配置接口
 */
export interface WorkerConfig {
  app: AppConfig;
  rabbitmq: RabbitMQConfig;
}









