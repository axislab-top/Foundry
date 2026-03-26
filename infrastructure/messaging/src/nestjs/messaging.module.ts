/**
 * NestJS 消息队列模块
 */

import { Module, DynamicModule, Global } from '@nestjs/common';
import type {
  MessageQueueAdapter,
  MessageQueueConfig,
} from '../types/index.js';
import {
  MessageQueueAdapterFactory,
  messageQueueFactory,
} from '../factory/message-queue.factory.js';
import { MessagingService } from './messaging.service.js';
import { MESSAGING_ADAPTER, MESSAGING_CONFIG } from './messaging.constants.js';

@Global()
@Module({})
export class MessagingModule {
  /**
   * 注册消息队列模块
   */
  static forRoot(config?: MessageQueueConfig): DynamicModule {
    const factory = new MessageQueueAdapterFactory();
    const finalConfig = config || factory.createConfigFromEnv();
    const adapter = factory.createAdapter(finalConfig);

    return {
      module: MessagingModule,
      providers: [
        {
          provide: MESSAGING_CONFIG,
          useValue: finalConfig,
        },
        {
          provide: MESSAGING_ADAPTER,
          useValue: adapter,
        },
        MessagingService,
      ],
      exports: [MessagingService, MESSAGING_ADAPTER],
    };
  }

  /**
   * 使用自定义适配器注册
   */
  static forRootAsync(options: {
    useFactory: (
      ...args: any[]
    ) => Promise<MessageQueueConfig> | MessageQueueConfig;
    inject?: any[];
  }): DynamicModule {
    return {
      module: MessagingModule,
      providers: [
        {
          provide: MESSAGING_CONFIG,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        {
          provide: MESSAGING_ADAPTER,
          useFactory: (config: MessageQueueConfig) => {
            const factory = new MessageQueueAdapterFactory();
            return factory.createAdapter(config);
          },
          inject: [MESSAGING_CONFIG],
        },
        MessagingService,
      ],
      exports: [MessagingService, MESSAGING_ADAPTER],
    };
  }
}































