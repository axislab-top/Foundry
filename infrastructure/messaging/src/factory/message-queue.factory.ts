/**
 * 消息队列适配器工厂
 */

import {
  MessageQueueAdapter,
  MessageQueueConfig,
  MessageQueueAdapterType,
  MessageQueueOptions,
} from '../types/index.js';
import { RabbitMQAdapter } from '../adapters/rabbitmq.adapter.js';

/**
 * 消息队列适配器工厂
 */
export class MessageQueueAdapterFactory {
  /**
   * 创建适配器
   */
  createAdapter(config: MessageQueueConfig): MessageQueueAdapter {
    switch (config.adapter) {
      case MessageQueueAdapterType.RABBITMQ:
        return new RabbitMQAdapter(config.options as any);

      case MessageQueueAdapterType.REDIS_STREAMS:
        throw new Error(
          'Redis Streams adapter not yet implemented. Please use RabbitMQ.',
        );

      case MessageQueueAdapterType.KAFKA:
        throw new Error(
          'Kafka adapter not yet implemented. Please use RabbitMQ.',
        );

      case MessageQueueAdapterType.MEMORY:
        throw new Error(
          'Memory adapter not yet implemented. Please use RabbitMQ.',
        );

      default:
        throw new Error(`Unsupported adapter type: ${config.adapter}`);
    }
  }

  /**
   * 从环境变量创建配置
   */
  createConfigFromEnv(): MessageQueueConfig {
    const adapter =
      (process.env.MESSAGE_QUEUE_ADAPTER as MessageQueueAdapterType) ||
      MessageQueueAdapterType.RABBITMQ;

    const options: MessageQueueOptions = {
      host: process.env.RABBITMQ_HOST || 'localhost',
      port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
      username: process.env.RABBITMQ_USER || 'admin',
      password: process.env.RABBITMQ_PASSWORD || 'admin123',
      vhost: process.env.RABBITMQ_VHOST || '/',
      /** 与 apps/api、gateway 的 RMQ_URL 对齐，避免只配了 RMQ_URL 时事件总线仍按零散变量（或默认 guest）连接 */
      uri: process.env.RMQ_URL || process.env.RABBITMQ_URI,
      prefetchCount: parseInt(
        process.env.RABBITMQ_PREFETCH_COUNT || '10',
        10,
      ),
      reconnectDelay: parseInt(
        process.env.RABBITMQ_RECONNECT_DELAY || '5000',
        10,
      ),
      maxRetries: parseInt(process.env.RABBITMQ_MAX_RETRIES || '10', 10),
      heartbeatSeconds: parseInt(
        process.env.RABBITMQ_HEARTBEAT_SECONDS ||
          process.env.RMQ_HEARTBEAT_SECONDS ||
          '60',
        10,
      ),
      keepAliveDelayMs: parseInt(
        process.env.RABBITMQ_KEEPALIVE_DELAY_MS ||
          process.env.RMQ_KEEPALIVE_DELAY_MS ||
          '10000',
        10,
      ),
      /**
       * 当 channel.publish 返回 false（写缓冲满）时，等待 drain 的上限。
       * 防止某些发布路径无限等待导致上层 RPC 超时。
       */
      publishDrainTimeoutMs: parseInt(
        process.env.RABBITMQ_PUBLISH_DRAIN_TIMEOUT_MS || '5000',
        10,
      ),
    };

    return {
      adapter,
      options,
    };
  }
}

/**
 * 默认工厂实例
 */
export const messageQueueFactory = new MessageQueueAdapterFactory();



