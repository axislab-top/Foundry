/**
 * 登录成功事件监听器
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { LoginSuccessEvent } from '@contracts/events';
import type { MessageContext } from '@service/messaging';
import { createLogger, LogLevel } from '@service/logging';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import {
  TenantContextService,
  resolveCompanyIdFromEvent,
} from '@service/tenant';

@Injectable()
export class LoginSuccessListener implements OnModuleInit {
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
    try {
      await this.messagingService.subscribe<LoginSuccessEvent>(
        'auth.login_success',
        this.handleLoginSuccess.bind(this),
        {
          queue: 'auth-login-success-queue',
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

      this.logger.info('Subscribed to auth.login_success events', {
        queue: 'auth-login-success-queue',
      });
    } catch (error: any) {
      this.logger.error('Failed to subscribe to auth.login_success events', {
        error: error.message,
      });
    }
  }

  /**
   * 处理登录成功事件
   */
  private async handleLoginSuccess(
    event: LoginSuccessEvent,
    context: MessageContext,
  ): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event);
    if (companyId) {
      return this.tenantContext.runWithCompanyId(companyId, async () => {
        await this.processLoginSuccess(event);
      });
    }

    await this.processLoginSuccess(event);
  }

  private async processLoginSuccess(event: LoginSuccessEvent): Promise<void> {
    const ok = this.idempotency.markIfNew(
      `auth.login_success:${event.eventId}`,
      24 * 60 * 60_000,
    );
    if (!ok) {
      this.logger.warn('Duplicate event skipped', {
        eventType: event.eventType,
        eventId: event.eventId,
      });
      return;
    }

    this.logger.info('Received auth.login_success event', {
      eventId: event.eventId,
      userId: event.data.userId,
      email: event.data.email,
      ipAddress: event.data.ipAddress,
    });

    try {
      // 记录登录日志
      await this.recordLoginLog(event);

      // 安全检查（如异常 IP 检测）
      await this.performSecurityCheck(event);

      // 更新用户统计
      await this.updateUserStatistics(event.data.userId);

      this.logger.info('Successfully processed auth.login_success event', {
        eventId: event.eventId,
        userId: event.data.userId,
      });
    } catch (error: any) {
      this.logger.error('Failed to process auth.login_success event', {
        eventId: event.eventId,
        userId: event.data.userId,
        error: error.message,
      });
      throw error;
    }
  }

  private async recordLoginLog(event: LoginSuccessEvent): Promise<void> {
    this.logger.info('Recording login log', {
      userId: event.data.userId,
      ipAddress: event.data.ipAddress,
      userAgent: event.data.userAgent,
      loginAt: event.data.loginAt,
    });
  }

  private async performSecurityCheck(event: LoginSuccessEvent): Promise<void> {
    this.logger.info('Performing security check', {
      userId: event.data.userId,
      ipAddress: event.data.ipAddress,
      loginAt: event.data.loginAt,
    });

    // 这里做“可运行”的最小实现：对缺失关键信息做告警。
    // 真实异常检测可在后续接入风控策略服务/DB。
    if (!event.data.ipAddress) {
      this.logger.warn('Security check: missing ipAddress', {
        userId: event.data.userId,
        eventId: event.eventId,
      });
    }

    if (!event.data.userAgent) {
      this.logger.warn('Security check: missing userAgent', {
        userId: event.data.userId,
        eventId: event.eventId,
      });
    }
  }

  private async updateUserStatistics(userId: string): Promise<void> {
    this.logger.info('Updating user statistics', { userId });

    // worker 当前不直接访问用户库，因此这里实现“可运行”的统计占位：
    // 通过结构化日志+指标导出由下游系统进行汇总。
    this.logger.info('User statistics updated (logical)', { userId });
  }
}

