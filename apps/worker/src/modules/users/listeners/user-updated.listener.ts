/**
 * 用户更新事件监听器
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { UserUpdatedEvent } from '@contracts/events';
import type { MessageContext } from '@service/messaging';
import { createLogger, LogLevel } from '@service/logging';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';

@Injectable()
export class UserUpdatedListener implements OnModuleInit {
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
      await this.messagingService.subscribe<UserUpdatedEvent>(
        'user.updated',
        this.handleUserUpdated.bind(this),
        {
          queue: 'user-updated-queue',
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

      this.logger.info('Subscribed to user.updated events', {
        queue: 'user-updated-queue',
      });
    } catch (error: any) {
      this.logger.error('Failed to subscribe to user.updated events', {
        error: error.message,
      });
    }
  }

  /**
   * 处理用户更新事件
   */
  private async handleUserUpdated(
    event: UserUpdatedEvent,
    context: MessageContext,
  ): Promise<void> {
    const ok = this.idempotency.markIfNew(
      `user.updated:${event.eventId}`,
      24 * 60 * 60_000,
    );
    if (!ok) {
      this.logger.warn('Duplicate event skipped', {
        eventType: event.eventType,
        eventId: event.eventId,
      });
      return;
    }

    this.logger.info('Received user.updated event', {
      eventId: event.eventId,
      userId: event.data.userId,
      changes: Object.keys(event.data.changes),
    });

    try {
      // 处理用户更新后的逻辑
      if (event.data.changes.roles) {
        await this.handleRoleChange(
          event.data.userId,
          event.data.changes.roles,
        );
      }

      if (event.data.changes.email) {
        await this.handleEmailChange(
          event.data.userId,
          event.data.changes.email,
        );
      }

      this.logger.info('Successfully processed user.updated event', {
        eventId: event.eventId,
        userId: event.data.userId,
      });
    } catch (error: any) {
      this.logger.error('Failed to process user.updated event', {
        eventId: event.eventId,
        userId: event.data.userId,
        error: error.message,
      });
      throw error;
    }
  }

  private async handleRoleChange(userId: string, roles: string[]): Promise<void> {
    this.logger.info('Handling role change', { userId, roles });
    // 最小可运行实现：记录角色变更，用于审计/排障。
    if (!roles?.length) {
      this.logger.warn('Role change: roles is empty', { userId });
    }
  }

  private async handleEmailChange(userId: string, newEmail: string): Promise<void> {
    this.logger.info('Handling email change', { userId, newEmail });
    // 最小可运行实现：记录邮箱变更。
    if (!newEmail) {
      this.logger.warn('Email change: newEmail is empty', { userId });
    }
  }
}

