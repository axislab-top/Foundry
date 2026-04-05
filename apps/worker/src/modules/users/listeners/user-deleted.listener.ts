/**
 * 用户删除事件监听器
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { UserDeletedEvent } from '@contracts/events';
import type { MessageContext } from '@service/messaging';
import { createLogger, LogLevel } from '@service/logging';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import {
  TenantContextService,
  resolveCompanyIdFromEvent,
} from '@service/tenant';

@Injectable()
export class UserDeletedListener implements OnModuleInit {
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
      await this.messagingService.subscribe<UserDeletedEvent>(
        'user.deleted',
        this.handleUserDeleted.bind(this),
        {
          queue: 'user-deleted-queue',
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

      this.logger.info('Subscribed to user.deleted events', {
        queue: 'user-deleted-queue',
      });
    } catch (error: any) {
      this.logger.error('Failed to subscribe to user.deleted events', {
        error: error.message,
      });
    }
  }

  /**
   * 处理用户删除事件
   */
  private async handleUserDeleted(
    event: UserDeletedEvent,
    context: MessageContext,
  ): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event);
    if (companyId) {
      return this.tenantContext.runWithCompanyId(companyId, async () => {
        await this.processUserDeleted(event);
      });
    }

    await this.processUserDeleted(event);
  }

  private async processUserDeleted(event: UserDeletedEvent): Promise<void> {
    const ok = this.idempotency.markIfNew(
      `user.deleted:${event.eventId}`,
      24 * 60 * 60_000,
    );
    if (!ok) {
      this.logger.warn('Duplicate event skipped', {
        eventType: event.eventType,
        eventId: event.eventId,
      });
      return;
    }

    this.logger.info('Received user.deleted event', {
      eventId: event.eventId,
      userId: event.data.userId,
    });

    try {
      // 清理用户相关数据
      await Promise.all([
        this.cleanupUserData(event.data.userId),
        this.archiveUserContent(event.data.userId),
        this.notifyUserDeletion(event.data.userId),
      ]);

      this.logger.info('Successfully processed user.deleted event', {
        eventId: event.eventId,
        userId: event.data.userId,
      });
    } catch (error: any) {
      this.logger.error('Failed to process user.deleted event', {
        eventId: event.eventId,
        userId: event.data.userId,
        error: error.message,
      });
      throw error;
    }
  }

  private async cleanupUserData(userId: string): Promise<void> {
    this.logger.info('Cleaning up user data', { userId });
    // 最小可运行实现：记录清理动作（worker 当前未接入 DB/存储）。
    this.logger.info('User data cleaned up (logical)', { userId });
  }

  private async archiveUserContent(userId: string): Promise<void> {
    this.logger.info('Archiving user content', { userId });
    // 最小可运行实现：记录归档动作（真实归档可后续接入对象存储/归档库）。
    this.logger.info('User content archived (logical)', { userId });
  }

  private async notifyUserDeletion(userId: string): Promise<void> {
    this.logger.info('Notifying user deletion', { userId });
    // 最小可运行实现：记录通知动作。
    this.logger.info('User deletion notified (logical)', { userId });
  }
}

