import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service.js';
import { MessagingService } from '@service/messaging';
import type { IUserInfo } from '../users/interfaces/user.interface.js';
import type {
  LoginSuccessEvent,
  LoginFailedEvent,
} from '@contracts/events';

/**
 * 认证服务
 * 处理认证相关的业务逻辑
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly messagingService: MessagingService,
  ) {}

  /**
   * 验证用户凭证
   * 用于登录时验证用户邮箱和密码
   */
  async validateCredentials(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IUserInfo> {
    try {
      const userInfo = await this.usersService.validateUserCredentials(
        email,
        password,
      );

      // 发布登录成功事件
      try {
        const event: LoginSuccessEvent = {
          eventId: randomUUID(),
          eventType: 'auth.login_success',
          aggregateId: userInfo.id,
          aggregateType: 'auth',
          occurredAt: new Date().toISOString(),
          version: 1,
          data: {
            userId: userInfo.id,
            email: userInfo.email,
            tokenId: randomUUID(), // 实际应该从 Gateway 传入
            loginAt: new Date().toISOString(),
            ipAddress,
            userAgent,
          },
        };

        await this.messagingService.publish(event, {
          routingKey: 'auth.login_success',
          persistent: true,
        });
      } catch (error: any) {
        this.logger.error('Failed to publish auth.login_success event', {
          error: error.message,
          email,
        });
      }

      return userInfo;
    } catch (error: any) {
      // 发布登录失败事件
      try {
        const failureReason = this.getFailureReason(error);

        const event: LoginFailedEvent = {
          eventId: randomUUID(),
          eventType: 'auth.login_failed',
          aggregateId: email,
          aggregateType: 'auth',
          occurredAt: new Date().toISOString(),
          version: 1,
          data: {
            email,
            reason: failureReason,
            failedAt: new Date().toISOString(),
            ipAddress,
            userAgent,
          },
        };

        await this.messagingService.publish(event, {
          routingKey: 'auth.login_failed',
          persistent: true,
        });
      } catch (publishError: any) {
        this.logger.error('Failed to publish auth.login_failed event', {
          error: publishError.message,
          email,
        });
      }

      throw error;
    }
  }

  /**
   * 获取失败原因
   */
  private getFailureReason(error: any): 'invalid_credentials' | 'user_disabled' | 'user_not_found' {
    const message = error.message || '';
    if (message.includes('不存在') || message.includes('not found')) {
      return 'user_not_found';
    }
    if (message.includes('禁用') || message.includes('disabled')) {
      return 'user_disabled';
    }
    return 'invalid_credentials';
  }
}







