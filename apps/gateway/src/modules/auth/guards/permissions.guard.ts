import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator.js';
import type { UserInfo } from '../interfaces/auth-result.interface.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { GatewayException } from '../../../common/exceptions/filters/gateway-exception.filter.js';

/**
 * 权限守卫
 * 检查用户是否具有所需权限
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: UserInfo = request.user;

    if (!user) {
      throw new GatewayException(
        ErrorCode.UNAUTHORIZED,
        'User not authenticated',
        401,
      );
    }

    const hasPermission = requiredPermissions.some((permission) =>
      user.permissions?.includes(permission),
    );

    if (!hasPermission) {
      throw new GatewayException(
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
        'Insufficient permissions',
        403,
      );
    }

    return true;
  }
}


