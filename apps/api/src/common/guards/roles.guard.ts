import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { ErrorCode } from '../exceptions/error-codes.js';
import type { UserInfo } from '../types/user.types.js';

/**
 * 角色守卫
 * 验证用户是否具有所需的角色
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 如果没有要求特定角色，允许访问
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: UserInfo | undefined = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '禁止访问：用户未认证',
      });
    }

    // 检查用户角色
    const userRoles = user.roles || [];

    // 检查用户是否具有任一所需角色
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: `禁止访问：需要以下角色之一：${requiredRoles.join(', ')}`,
      });
    }

    return true;
  }
}




































