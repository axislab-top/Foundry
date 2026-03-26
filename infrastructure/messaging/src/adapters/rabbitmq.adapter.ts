/**
 * RabbitMQ 消息队列适配器
 */

import * as amqp from 'amqplib';
import type {
  MessageQueueAdapter,
  MessageQueueOptions,
  RabbitMQOptions,
  PublishOptions,
  SubscribeOptions,
  MessageHandler,
  MessageContext,
} from '../types/index.js';
import type { BaseEvent } from '@contracts/events';
import { createLogger, LogLevel } from '@service/logging';

/**
 * RabbitMQ 适配器
 */
export class RabbitMQAdapter implements MessageQueueAdapter {
  private connection: any = null;
  private channel: any = null;
  private options: RabbitMQOptions;
  private logger = createLogger({
    service: 'messaging-rabbitmq',
    level: LogLevel.INFO,
  });
  private subscribers: Map<string, string> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay: number;

  constructor(options: RabbitMQOptions) {
    this.options = {
      exchange: 'events',
      exchangeType: 'topic',
      routingKey: '#',
      durable: true,
      autoDelete: false,
      prefetchCount: 10,
      reconnectDelay: 5000,
      maxRetries: 10,
      ...options,
    };
    this.reconnectDelay = this.options.reconnectDelay || 5000;
  }

  /**
   * 连接 RabbitMQ
   */
  async connect(): Promise<void> {
    if (this.isConnected()) {
      this.logger.warn('Already connected to RabbitMQ');
      return;
    }

    try {
      const uri = this.options.uri || this.buildUri();
      this.logger.info('Connecting to RabbitMQ', { uri: this.sanitizeUri(uri) });

      const conn = (await amqp.connect(uri)) as any;
      this.connection = conn;
      this.channel = await conn.createChannel();

      // 设置 QoS（Quality of Service）
      await this.channel!.prefetch(this.options.prefetchCount || 10);

      // 声明交换器
      await this.declareExchange();

      // 监听连接错误
      this.connection.on('error', (error: any) => {
        this.logger.error('RabbitMQ connection error', { error: error.message });
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.connection = null;
        this.channel = null;
        this.handleReconnect();
      });

      this.logger.info('Connected to RabbitMQ successfully');
    } catch (error: any) {
      this.logger.error('Failed to connect to RabbitMQ', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.channel) {
      try {
        await this.channel.close();
      } catch (error) {
        this.logger.warn('Error closing channel', { error });
      }
      this.channel = null;
    }

    if (this.connection) {
      try {
        await this.connection.close();
      } catch (error) {
        this.logger.warn('Error closing connection', { error });
      }
      this.connection = null;
    }

    this.subscribers.clear();
    this.logger.info('Disconnected from RabbitMQ');
  }

  /**
   * 发布消息
   */
  async publish<T extends BaseEvent>(
    event: T,
    options: PublishOptions = {},
  ): Promise<boolean> {
    if (!this.isConnected() || !this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      const exchange = options.exchange || this.options.exchange || 'events';
      const routingKey =
        options.routingKey || this.getRoutingKey(event.eventType);
      const message = Buffer.from(JSON.stringify(event));
      const messageOptions: amqp.Options.Publish = {
        persistent: options.persistent ?? true,
        priority: options.priority,
        expiration: options.expiration?.toString(),
        headers: options.headers,
        correlationId: options.correlationId || event.eventId,
        replyTo: options.replyTo,
        messageId: options.messageId || event.eventId,
        timestamp: options.timestamp || Date.now(),
        type: options.type || event.eventType,
        userId: options.userId,
        appId: options.appId,
      };

      const published = this.channel.publish(
        exchange,
        routingKey,
        message,
        messageOptions,
      );

      if (published) {
        this.logger.debug('Message published', {
          eventType: event.eventType,
          routingKey,
          exchange,
        });
      } else {
        this.logger.warn('Message buffer full, waiting for drain', {
          eventType: event.eventType,
        });
        await new Promise<void>((resolve) => {
          if (this.channel) {
            this.channel.once('drain', () => resolve());
          } else {
            resolve();
          }
        });
      }

      return published;
    } catch (error: any) {
      this.logger.error('Failed to publish message', {
        error: error.message,
        eventType: event.eventType,
      });
      throw error;
    }
  }

  /**
   * 订阅消息
   */
  async subscribe<T extends BaseEvent>(
    eventType: string,
    handler: MessageHandler<T>,
    options: SubscribeOptions = {},
  ): Promise<void> {
    if (!this.isConnected() || !this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      const exchange = options.exchange || this.options.exchange || 'events';
      const queue =
        options.queue ||
        this.getQueueName(eventType, options.exclusive || false);
      const routingKey = options.routingKey || this.getRoutingKey(eventType);
      const durable = options.durable ?? true;
      const exclusive = options.exclusive ?? false;
      const autoDelete = options.autoDelete ?? false;

      const retryEnabled =
        !!options.retry?.enabled && !(options.noAck ?? false);
      const maxAttempts = options.retry?.maxAttempts ?? 5;
      const initialDelayMs = options.retry?.initialDelayMs ?? 1000;
      const backoffFactor = options.retry?.backoffFactor ?? 2;
      const maxDelayMs = options.retry?.maxDelayMs ?? 60_000;
      const retryQueueSuffix = options.retry?.retryQueueSuffix ?? '.retry';
      const dlqQueueSuffix = options.retry?.dlqQueueSuffix ?? '.dlq';
      const retryQueue = `${queue}${retryQueueSuffix}`;
      const dlqQueue = `${queue}${dlqQueueSuffix}`;

      // 声明队列
      await this.channel.assertQueue(queue, {
        durable,
        exclusive,
        autoDelete,
        arguments: options.arguments,
      });

      // 声明 retry / dlq 队列（当启用 retry 时）
      if (retryEnabled) {
        await this.channel.assertQueue(dlqQueue, {
          durable: true,
          exclusive: false,
          autoDelete: false,
        });

        await this.channel.assertQueue(retryQueue, {
          durable: true,
          exclusive: false,
          autoDelete: false,
          arguments: {
            // retry queue 消息过期后回到原 exchange/routingKey
            'x-dead-letter-exchange': exchange,
            'x-dead-letter-routing-key': routingKey,
          },
        });
      }

      // 绑定队列到交换器
      if (Array.isArray(routingKey)) {
        for (const key of routingKey) {
          await this.channel.bindQueue(queue, exchange, key);
        }
      } else {
        await this.channel.bindQueue(queue, exchange, routingKey);
      }

      // 设置 QoS
      if (options.prefetchCount) {
        await this.channel.prefetch(options.prefetchCount);
      }

      // 消费消息
      const consumeResult = await this.channel.consume(
        queue,
        async (msg: any) => {
          if (!msg) {
            return;
          }

          try {
            const event = JSON.parse(msg.content.toString()) as T;
            const context: MessageContext = {
              deliveryTag: msg.fields.deliveryTag,
              exchange: msg.fields.exchange,
              routingKey: msg.fields.routingKey,
              correlationId: msg.properties.correlationId,
              replyTo: msg.properties.replyTo,
              messageId: msg.properties.messageId,
              timestamp: msg.properties.timestamp,
              redelivered: msg.fields.redelivered,
              priority: msg.properties.priority,
              headers: msg.properties.headers,
            };

            await handler(event, context);

            // 确认消息（如果 noAck 为 false）
            if (!options.noAck && this.channel) {
              this.channel.ack(msg);
            }
          } catch (error: any) {
            this.logger.error('Error processing message', {
              error: error.message,
              eventType,
              stack: error.stack,
            });

            if (this.channel && !(options.noAck ?? false) && retryEnabled) {
              const headers = msg.properties.headers || {};
              const prev = Number(headers['x-retry-count'] ?? 0);
              const nextAttempt = prev + 1; // 第一次失败 -> 1

              if (nextAttempt < maxAttempts) {
                const delay = Math.min(
                  Math.round(initialDelayMs * Math.pow(backoffFactor, prev)),
                  maxDelayMs,
                );

                // 发布到 retry queue，使用 per-message expiration 做延迟
                const nextHeaders = {
                  ...headers,
                  'x-retry-count': nextAttempt,
                  'x-original-queue': queue,
                  'x-error': (error?.message || 'unknown').slice(0, 500),
                };

                this.channel.sendToQueue(
                  retryQueue,
                  msg.content,
                  {
                    persistent: true,
                    headers: nextHeaders,
                    correlationId: msg.properties.correlationId,
                    messageId: msg.properties.messageId,
                    timestamp: Date.now(),
                    type: msg.properties.type,
                    expiration: String(delay),
                  } as any,
                );

                // ack 原消息，避免无限 redelivery
                this.channel.ack(msg);
                return;
              }

              // 超出重试次数：写入 DLQ
              const dlqHeaders = {
                ...headers,
                'x-retry-count': nextAttempt,
                'x-original-queue': queue,
                'x-final-error': (error?.message || 'unknown').slice(0, 500),
              };

              this.channel.sendToQueue(
                dlqQueue,
                msg.content,
                {
                  persistent: true,
                  headers: dlqHeaders,
                  correlationId: msg.properties.correlationId,
                  messageId: msg.properties.messageId,
                  timestamp: Date.now(),
                  type: msg.properties.type,
                } as any,
              );
              this.channel.ack(msg);
              return;
            }

            // 未启用 retry：保持现有行为（nack + requeue）
            if (this.channel) {
              const requeue = !(options.noAck ?? false);
              this.channel.nack(msg, false, requeue);
            }

            throw error;
          }
        },
        {
          noAck: options.noAck ?? false,
        },
      );

      this.subscribers.set(eventType, consumeResult.consumerTag);
      this.logger.info('Subscribed to event', {
        eventType,
        queue,
        routingKey: Array.isArray(routingKey) ? routingKey : [routingKey],
      });
    } catch (error: any) {
      this.logger.error('Failed to subscribe to event', {
        error: error.message,
        eventType,
      });
      throw error;
    }
  }

  /**
   * 取消订阅
   */
  async unsubscribe(eventType: string): Promise<void> {
    const consumerTag = this.subscribers.get(eventType);
    if (consumerTag && this.channel) {
      await this.channel.cancel(consumerTag);
      this.subscribers.delete(eventType);
      this.logger.info('Unsubscribed from event', { eventType });
    }
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 声明交换器
   */
  private async declareExchange(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not available');
    }

    const exchange = this.options.exchange || 'events';
    const exchangeType = this.options.exchangeType || 'topic';
    const durable = this.options.durable ?? true;
    const autoDelete = this.options.autoDelete ?? false;

    await this.channel.assertExchange(exchange, exchangeType, {
      durable,
      autoDelete,
    });

    this.logger.debug('Exchange declared', {
      exchange,
      type: exchangeType,
      durable,
      autoDelete,
    });
  }

  /**
   * 构建连接 URI
   */
  private buildUri(): string {
    const {
      host = 'localhost',
      port = 5672,
      username = 'guest',
      password = 'guest',
      vhost = '/',
    } = this.options;

    return `amqp://${username}:${password}@${host}:${port}${vhost}`;
  }

  /**
   * 清理 URI（移除密码）
   */
  private sanitizeUri(uri: string): string {
    return uri.replace(/:([^:@]+)@/, ':****@');
  }

  /**
   * 获取路由键
   */
  private getRoutingKey(eventType: string): string {
    // 将 event.type 转换为路由键格式
    // 例如: user.created -> user.created
    return eventType;
  }

  /**
   * 获取队列名称
   */
  private getQueueName(eventType: string, exclusive: boolean): string {
    if (exclusive) {
      return `event.${eventType}.${Date.now()}`;
    }
    return `event.${eventType}`;
  }

  /**
   * 处理重连
   */
  private handleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.logger.info('Attempting to reconnect to RabbitMQ');
      try {
        await this.connect();
      } catch (error) {
        this.logger.error('Reconnection failed', { error });
        this.handleReconnect();
      }
    }, this.reconnectDelay);
  }
}

