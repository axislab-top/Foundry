/**
 * 登录失败事件监听器
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { LoginFailedEvent } from '@contracts/events';
import type { MessageContext } from '@service/messaging';
import { createLogger, LogLevel } from '@service/logging';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';

@Injectable()
export class LoginFailedListener implements OnModuleInit {
  private readonly logger = createLogger({
    service: 'worker-service',
    level: LogLevel.INFO,
  });

  constructor(
    private readonly messagingService: MessagingService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async onModuleInit() {
    try {
      await this.messagingService.subscribe<LoginFailedEvent>(
        'auth.login_failed',
        this.handleLoginFailed.bind(this),
        {
          queue: 'auth-login-failed-queue',
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

      this.logger.info('Subscribed to auth.login_failed events', {
        queue: 'auth-login-failed-queue',
      });
    } catch (error: any) {
      this.logger.error('Failed to subscribe to auth.login_failed events', {
        error: error.message,
      });
    }
  }

  /**
   * 处理登录失败事件
   */
  private async handleLoginFailed(
    event: LoginFailedEvent,
    context: MessageContext,
  ): Promise<void> {
    const ok = this.idempotency.markIfNew(
      `auth.login_failed:${event.eventId}`,
      24 * 60 * 60_000,
    );
    if (!ok) {
      this.logger.warn('Duplicate event skipped', {
        eventType: event.eventType,
        eventId: event.eventId,
      });
      return;
    }

    this.logger.warn('Received auth.login_failed event', {
      eventId: event.eventId,
      email: event.data.email,
      reason: event.data.reason,
      ipAddress: event.data.ipAddress,
    });

    try {
      // 记录失败日志
      await this.recordFailedLoginLog(event);

      // 检查是否需要触发安全措施（如账户锁定）
      await this.checkSecurityMeasures(event);

      this.logger.info('Successfully processed auth.login_failed event', {
        eventId: event.eventId,
        email: event.data.email,
      });
    } catch (error: any) {
      this.logger.error('Failed to process auth.login_failed event', {
        eventId: event.eventId,
        email: event.data.email,
        error: error.message,
      });
      throw error;
    }
  }

  private async recordFailedLoginLog(event: LoginFailedEvent): Promise<void> {
    this.logger.info('Recording failed login log', {
      email: event.data.email,
      reason: event.data.reason,
      ipAddress: event.data.ipAddress,
      failedAt: event.data.failedAt,
    });
  }

  private async checkSecurityMeasures(event: LoginFailedEvent): Promise<void> {
    this.logger.info('Checking security measures', {
      email: event.data.email,
      ipAddress: event.data.ipAddress,
      reason: event.data.reason,
    });

    // 最小可运行实现：根据失败原因做告警标记（不做账户锁定，因为 worker 当前未接入用户库/锁表）。
    if (event.data.reason === 'invalid_credentials') {
      this.logger.warn('Security check: invalid credentials', {
        email: event.data.email,
        ipAddress: event.data.ipAddress,
      });
    }
  }
}

