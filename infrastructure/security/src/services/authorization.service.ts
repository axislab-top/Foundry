/**
 * 授权服务
 */

import { AuthorizationManager } from '../infrastructure/authorization-manager.js';
import type { PolicyContext, PolicyResult } from '../types/authorization.types.js';

export class AuthorizationService {
  private authorizationManager: AuthorizationManager;

  constructor(authorizationManager: AuthorizationManager) {
    this.authorizationManager = authorizationManager;
  }

  /**
   * 检查权限
   */
  async checkPermission(context: PolicyContext): Promise<PolicyResult> {
    return this.authorizationManager.checkPermission(context);
  }

  /**
   * 检查用户是否有指定角色
   */
  hasRole(userRoles: string[] | undefined, requiredRoles: string[]): boolean {
    return this.authorizationManager.hasRole(userRoles, requiredRoles);
  }

  /**
   * 检查用户是否有指定权限
   */
  hasPermission(
    userPermissions: string[] | undefined,
    requiredPermissions: string[],
  ): boolean {
    return this.authorizationManager.hasPermission(
      userPermissions,
      requiredPermissions,
    );
  }
}






































