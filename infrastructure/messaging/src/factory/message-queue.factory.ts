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
      uri: process.env.RABBITMQ_URI,
      prefetchCount: parseInt(
        process.env.RABBITMQ_PREFETCH_COUNT || '10',
        10,
      ),
      reconnectDelay: parseInt(
        process.env.RABBITMQ_RECONNECT_DELAY || '5000',
        10,
      ),
      maxRetries: parseInt(process.env.RABBITMQ_MAX_RETRIES || '10', 10),
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



