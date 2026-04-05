/**
 * 用户创建事件监听器
 */

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { UserCreatedEvent } from '@contracts/events';
import type { MessageContext } from '@service/messaging';
import { createLogger, LogLevel } from '@service/logging';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import {
  TenantContextService,
  resolveCompanyIdFromEvent,
} from '@service/tenant';

@Injectable()
export class UserCreatedListener implements OnModuleInit {
  private readonly logger = createLogger({
    service: 'worker-service',
    level: LogLevel.INFO,
  });

  constructor(
    private readonly messagingService: MessagingService,
    private readonly idempotency: IdempotencyService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async onModuleInit() {
    // 订阅用户创建事件
    try {
      await this.messagingService.subscribe<UserCreatedEvent>(
        'user.created',
        this.handleUserCreated.bind(this),
        {
          queue: 'user-created-queue',
          durable: true,
          prefetchCount: 10,
          retry: {
            enabled: true,
            maxAttempts: 5,
            initialDelayMs: 1000,
            backoffFactor: 2,
            maxDelayMs: 60_000,
          },
        },
      );

      this.logger.info('Subscribed to user.created events', {
        queue: 'user-created-queue',
      });
    } catch (error: any) {
      this.logger.error('Failed to subscribe to user.created events', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * 处理用户创建事件
   */
  private async handleUserCreated(
    event: UserCreatedEvent,
    context: MessageContext,
  ): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event);
    if (companyId) {
      return this.tenantContext.runWithCompanyId(companyId, async () => {
        await this.processUserCreated(event);
      });
    }

    await this.processUserCreated(event);
  }

  private async processUserCreated(event: UserCreatedEvent): Promise<void> {
    const ok = this.idempotency.markIfNew(
      `user.created:${event.eventId}`,
      24 * 60 * 60_000,
    );
    if (!ok) {
      this.logger.warn('Duplicate event skipped', {
        eventType: event.eventType,
        eventId: event.eventId,
      });
      return;
    }

    this.logger.info('Received user.created event', {
      eventId: event.eventId,
      userId: event.data.userId,
      email: event.data.email,
      username: event.data.username,
    });

    try {
      // 并行执行多个任务
      await Promise.all([
        this.sendWelcomeEmail(event.data.email, event.data.username),
        this.initializeUserData(event.data.userId),
        this.recordAnalytics(event),
      ]);

      this.logger.info('Successfully processed user.created event', {
        eventId: event.eventId,
        userId: event.data.userId,
      });
    } catch (error: any) {
      this.logger.error('Failed to process user.created event', {
        eventId: event.eventId,
        userId: event.data.userId,
        error: error.message,
        stack: error.stack,
      });
      // 重新抛出错误，让消息队列重新入队
      throw error;
    }
  }

  /**
   * 发送欢迎邮件
   */
  private async sendWelcomeEmail(email: string, username: string): Promise<void> {
    this.logger.info('Sending welcome email', { email, username });
    // 最小可运行实现：用结构化日志模拟邮件投递（避免引入外部依赖）。
    await new Promise((resolve) => setTimeout(resolve, 50));
    this.logger.info('Welcome email sent (logical)', { email, username });
  }

  /**
   * 初始化用户数据
   */
  private async initializeUserData(userId: string): Promise<void> {
    this.logger.info('Initializing user data', { userId });
    // worker 当前未接入数据库，因此这里做“可运行的最小实现”：记录初始化过程。
    await new Promise((resolve) => setTimeout(resolve, 50));
    this.logger.info('User data initialized (logical)', { userId });
  }

  /**
   * 记录分析数据
   */
  private async recordAnalytics(event: UserCreatedEvent): Promise<void> {
    this.logger.info('Recording analytics', {
      eventId: event.eventId,
      userId: event.data.userId,
    });
    // 最小可运行实现：记录分析事件（后续可替换为外部分析平台 SDK）。
    await new Promise((resolve) => setTimeout(resolve, 50));
    this.logger.info('Analytics recorded (logical)', { eventId: event.eventId });
  }
}

