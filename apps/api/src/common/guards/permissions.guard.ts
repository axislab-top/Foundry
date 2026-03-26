import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { ErrorCode } from '../exceptions/error-codes.js';
import type { UserInfo } from '../types/user.types.js';

/**
 * 权限守卫
 * 验证用户是否具有所需的权限
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 如果没有要求特定权限，允许访问
    if (!requiredPermissions || requiredPermissions.length === 0) {
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

    // 检查用户权限
    const userPermissions = user.permissions || [];

    // 检查用户是否具有任一所需权限
    const hasPermission = requiredPermissions.some((permission) =>
      userPermissions.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: `禁止访问：需要以下权限之一：${requiredPermissions.join(', ')}`,
      });
    }

    return true;
  }
}


































