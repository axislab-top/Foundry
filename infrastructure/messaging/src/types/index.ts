/**
 * 消息队列类型定义
 */

import type { BaseEvent } from '@contracts/events';

/**
 * 消息队列适配器类型
 */
export enum MessageQueueAdapterType {
  RABBITMQ = 'rabbitmq',
  REDIS_STREAMS = 'redis-streams',
  KAFKA = 'kafka',
  MEMORY = 'memory', // 用于测试
}

/**
 * 消息队列配置
 */
export interface MessageQueueConfig {
  adapter: MessageQueueAdapterType;
  options: MessageQueueOptions;
}

/**
 * 消息队列选项（通用）
 */
export interface MessageQueueOptions {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  vhost?: string;
  uri?: string;
  prefetchCount?: number;
  reconnectDelay?: number;
  maxRetries?: number;
  [key: string]: any;
}

/**
 * RabbitMQ 特定选项
 */
export interface RabbitMQOptions extends MessageQueueOptions {
  exchange?: string;
  exchangeType?: 'direct' | 'topic' | 'fanout' | 'headers';
  queue?: string;
  routingKey?: string;
  durable?: boolean;
  autoDelete?: boolean;
  /**
   * AMQP heartbeat（秒）。未设置时由 broker/client 协商；但显式设置能避免某些环境默认值过小导致空闲误断。
   */
  heartbeatSeconds?: number;
  /**
   * TCP keepalive 延迟（毫秒）。默认 10s。
   */
  keepAliveDelayMs?: number;
}

/**
 * 发布消息选项
 */
export interface PublishOptions {
  exchange?: string;
  routingKey?: string;
  persistent?: boolean;
  priority?: number;
  expiration?: string | number;
  headers?: Record<string, any>;
  correlationId?: string;
  replyTo?: string;
  messageId?: string;
  timestamp?: number;
  type?: string;
  userId?: string;
  appId?: string;
}

/**
 * 订阅消息选项
 */
export interface SubscribeOptions {
  queue?: string;
  exchange?: string;
  routingKey?: string | string[];
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  prefetchCount?: number;
  noAck?: boolean;
  priority?: number;
  arguments?: Record<string, any>;
  /**
   * 重试与死信（RabbitMQ 适配器优先支持）
   */
  retry?: {
    /**
     * 是否启用重试（仅在 noAck=false 时生效）
     */
    enabled?: boolean;
    /**
     * 最大尝试次数（包含首次消费），默认 5
     */
    maxAttempts?: number;
    /**
     * 初始延迟（毫秒），默认 1000
     */
    initialDelayMs?: number;
    /**
     * 退避系数，默认 2
     */
    backoffFactor?: number;
    /**
     * 最大延迟（毫秒），默认 60000
     */
    maxDelayMs?: number;
    /**
     * retry 队列后缀，默认 ".retry"
     */
    retryQueueSuffix?: string;
    /**
     * dlq 队列后缀，默认 ".dlq"
     */
    dlqQueueSuffix?: string;
  };
}

/**
 * 消息处理器
 */
export type MessageHandler<T = BaseEvent> = (
  message: T,
  context: MessageContext,
) => Promise<void> | void;

/**
 * 消息上下文
 */
export interface MessageContext {
  deliveryTag?: number;
  exchange?: string;
  routingKey?: string;
  correlationId?: string;
  replyTo?: string;
  messageId?: string;
  timestamp?: number;
  redelivered?: boolean;
  priority?: number;
  headers?: Record<string, any>;
}

/**
 * 消息队列适配器接口
 */
export interface MessageQueueAdapter {
  /**
   * 连接消息队列
   */
  connect(): Promise<void>;

  /**
   * 断开连接
   */
  disconnect(): Promise<void>;

  /**
   * 发布消息
   */
  publish<T extends BaseEvent>(
    event: T,
    options?: PublishOptions,
  ): Promise<boolean>;

  /**
   * 订阅消息
   */
  subscribe<T extends BaseEvent>(
    eventType: string,
    handler: MessageHandler<T>,
    options?: SubscribeOptions,
  ): Promise<void>;

  /**
   * 取消订阅
   */
  unsubscribe(eventType: string): Promise<void>;

  /**
   * 检查连接状态
   */
  isConnected(): boolean;

  /**
   * 健康检查
   */
  healthCheck(): Promise<boolean>;
}

/**
 * 消息队列适配器工厂
 */
export interface MessageQueueAdapterFactory {
  createAdapter(config: MessageQueueConfig): MessageQueueAdapter;
}































