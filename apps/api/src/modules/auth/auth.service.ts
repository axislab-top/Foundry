import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service.js';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import type { IUserInfo } from '../users/interfaces/user.interface.js';
import type {
  LoginSuccessEvent,
  LoginFailedEvent,
} from '@contracts/events';
import { AdminUsersService } from '../admin-users/admin-users.service.js';
import { RegisterAdminDto } from '../admin-users/dto/register-admin.dto.js';

/**
 * 认证服务
 * 处理认证相关的业务逻辑
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly adminUsersService: AdminUsersService,
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
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
        const companyId = this.tenantContext.getCompanyId();
        const event: LoginSuccessEvent = {
          eventId: randomUUID(),
          eventType: 'auth.login_success',
          aggregateId: userInfo.id,
          aggregateType: 'auth',
          occurredAt: new Date().toISOString(),
          version: 1,
          companyId,
          data: {
            userId: userInfo.id,
            email: userInfo.email,
            tokenId: randomUUID(), // 实际应该从 Gateway 传入
            loginAt: new Date().toISOString(),
            ipAddress,
            userAgent,
            companyId,
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
        const companyId = this.tenantContext.getCompanyId();
        const failureReason = this.getFailureReason(error);

        const event: LoginFailedEvent = {
          eventId: randomUUID(),
          eventType: 'auth.login_failed',
          aggregateId: email,
          aggregateType: 'auth',
          occurredAt: new Date().toISOString(),
          version: 1,
          companyId,
          data: {
            email,
            reason: failureReason,
            failedAt: new Date().toISOString(),
            ipAddress,
            userAgent,
            companyId,
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

  async validateAdminCredentials(email: string, password: string) {
    return this.adminUsersService.validateCredentials(email, password);
  }

  async registerAdmin(registerDto: RegisterAdminDto) {
    return this.adminUsersService.register(registerDto);
  }

  async findAdminById(id: string) {
    return this.adminUsersService.findById(id);
  }

  /** 供 Gateway refresh / JWT 校验回源（内网调用，与 admin/users/:id 同级） */
  async findUserByIdForGateway(id: string): Promise<IUserInfo | null> {
    try {
      const user = await this.usersService.findOne(id);
      if (!user?.enabled) {
        return null;
      }
      return {
        id: user.id,
        username: user.username,
        email: user.email,
      };
    } catch {
      return null;
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







