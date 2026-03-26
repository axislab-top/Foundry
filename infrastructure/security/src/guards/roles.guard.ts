/**
 * 角色守卫（NestJS）
 * 
 * 注意：这是一个基础实现，实际使用时需要根据具体框架调整
 */

import type { AuthGuard } from './auth.guard.js';

export abstract class BaseRolesGuard implements AuthGuard {
  abstract canActivate(context: any): boolean | Promise<boolean>;

  protected hasRole(userRoles: string[] | undefined, requiredRoles: string[]): boolean {
    if (!userRoles || userRoles.length === 0) {
      return false;
    }
    return requiredRoles.some((role) => userRoles.includes(role));
  }
}






































