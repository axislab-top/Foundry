/**
 * 权限守卫（NestJS）
 * 
 * 注意：这是一个基础实现，实际使用时需要根据具体框架调整
 */

import type { AuthGuard } from './auth.guard.js';

export abstract class BasePermissionsGuard implements AuthGuard {
  abstract canActivate(context: any): boolean | Promise<boolean>;

  protected hasPermission(
    userPermissions: string[] | undefined,
    requiredPermissions: string[],
  ): boolean {
    if (!userPermissions || userPermissions.length === 0) {
      return false;
    }
    return requiredPermissions.some((permission) =>
      userPermissions.includes(permission),
    );
  }
}






































