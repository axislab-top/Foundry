/**
 * 用户创建事件监听器测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UserCreatedListener } from './user-created.listener.js';
import { MessagingService } from '@service/messaging';
import type { UserCreatedEvent } from '@contracts/events';

describe('UserCreatedListener', () => {
  let listener: UserCreatedListener;
  let messagingService: jest.Mocked<MessagingService>;

  beforeEach(async () => {
    const mockMessagingService = {
      subscribe: jest.fn(),
      publish: jest.fn(),
      isConnected: jest.fn(() => true),
      healthCheck: jest.fn(() => Promise.resolve(true)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserCreatedListener,
        {
          provide: MessagingService,
          useValue: mockMessagingService,
        },
      ],
    }).compile();

    listener = module.get<UserCreatedListener>(UserCreatedListener);
    messagingService = module.get(MessagingService);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  it('should subscribe to user.created events on module init', async () => {
    await listener.onModuleInit();

    expect(messagingService.subscribe).toHaveBeenCalledWith(
      'user.created',
      expect.any(Function),
      {
        queue: 'user-created-queue',
        durable: true,
        prefetchCount: 10,
      },
    );
  });

  it('should handle user created event', async () => {
    const event: UserCreatedEvent = {
      eventId: 'event-123',
      eventType: 'user.created',
      aggregateId: 'user-456',
      aggregateType: 'user',
      occurredAt: new Date().toISOString(),
      version: 1,
      data: {
        userId: 'user-456',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user'],
        permissions: [],
        createdAt: new Date().toISOString(),
      },
    };

    const context = {
      deliveryTag: 1,
      exchange: 'events',
      routingKey: 'user.created',
    };

    // 调用 handleUserCreated（通过订阅的回调）
    await listener.onModuleInit();
    const subscribeCall = messagingService.subscribe.mock.calls[0];
    const handler = subscribeCall[1];

    await handler(event, context);

    // 验证处理逻辑（这里只是确保没有抛出错误）
    expect(true).toBe(true);
  });
});































