/**
 * NestJS 消息队列服务
 */

import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type {
  MessageQueueAdapter,
  PublishOptions,
  SubscribeOptions,
  MessageHandler,
} from '../types/index.js';
import { MESSAGING_ADAPTER } from './messaging.constants.js';
import type { BaseEvent } from '@contracts/events';

/**
 * 消息队列服务
 */
@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(MESSAGING_ADAPTER)
    private readonly adapter: MessageQueueAdapter,
  ) {}

  /**
   * 模块初始化
   */
  async onModuleInit() {
    try {
      await this.adapter.connect();
    } catch (error: any) {
      // 连接失败时记录错误但不阻塞应用启动
      console.warn('MessagingService: Failed to connect to message queue, will retry in background:', error.message);
      // 可以在这里实现后台重连逻辑
    }
  }

  /**
   * 模块销毁
   */
  async onModuleDestroy() {
    await this.adapter.disconnect();
  }

  /**
   * 发布消息
   */
  async publish<T extends BaseEvent>(
    event: T,
    options?: PublishOptions,
  ): Promise<boolean> {
    if (!this.isConnected()) {
      console.warn('MessagingService: Not connected, message will not be published:', event.eventType);
      return false;
    }
    try {
      return await this.adapter.publish(event, options);
    } catch (error: any) {
      console.error('MessagingService: Failed to publish message:', error.message);
      return false;
    }
  }

  /**
   * 订阅消息
   */
  async subscribe<T extends BaseEvent>(
    eventType: string,
    handler: MessageHandler<T>,
    options?: SubscribeOptions,
  ): Promise<void> {
    return this.adapter.subscribe(eventType, handler, options);
  }

  /**
   * 取消订阅
   */
  async unsubscribe(eventType: string): Promise<void> {
    return this.adapter.unsubscribe(eventType);
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.adapter.isConnected();
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    return this.adapter.healthCheck();
  }
}





