import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator.js';
import type { UserInfo } from '../interfaces/auth-result.interface.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { GatewayException } from '../../../common/exceptions/filters/gateway-exception.filter.js';

/**
 * 角色守卫
 * 检查用户是否具有所需角色
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
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

    const hasRole = requiredRoles.some((role) =>
      user.roles?.includes(role),
    );

    if (!hasRole) {
      throw new GatewayException(
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
        'Insufficient permissions',
        403,
      );
    }

    return true;
  }
}


