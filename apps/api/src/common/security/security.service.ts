import { Injectable, Inject } from '@nestjs/common';
import {
  SecurityManager,
  TokenManager,
  HashingManager,
  EncryptionManager,
  AuthorizationManager,
} from '@service/security';
import type { SecurityManager as ISecurityManager } from '@service/security';

/**
 * 安全服务
 * 封装 SecurityManager，提供 NestJS 友好的接口
 */
@Injectable()
export class SecurityService {
  private securityManager: ISecurityManager;

  constructor(@Inject('SECURITY_MANAGER') securityManager: ISecurityManager) {
    this.securityManager = securityManager;
  }

  /**
   * 获取令牌管理器
   */
  getTokenManager(): TokenManager {
    return this.securityManager.getTokenManager();
  }

  /**
   * 获取哈希管理器
   */
  getHashingManager(): HashingManager {
    return this.securityManager.getHashingManager();
  }

  /**
   * 获取加密管理器
   */
  getEncryptionManager(): EncryptionManager {
    return this.securityManager.getEncryptionManager();
  }

  /**
   * 获取授权管理器
   */
  getAuthorizationManager(): AuthorizationManager {
    return this.securityManager.getAuthorizationManager();
  }

  /**
   * 获取 SecurityManager 实例
   */
  getSecurityManager(): ISecurityManager {
    return this.securityManager;
  }
}





































