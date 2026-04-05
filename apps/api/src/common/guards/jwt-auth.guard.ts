import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ErrorCode } from '../exceptions/error-codes.js';
import type { UserInfo } from '../types/user.types.js';

/**
 * JWT 认证守卫
 * 验证 Gateway 注入的用户信息
 * 
 * 注意：认证逻辑在 Gateway 层处理，此守卫只验证用户信息是否存在
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 微服务 RPC 不经 HTTP 中间件，无 req.user；身份由 Gateway 校验后通过 payload.actor 传入各 RpcController。
    const ctxType =
      typeof context.getType === 'function' ? context.getType() : 'http';
    if (ctxType === 'rpc') {
      return true;
    }

    // 检查是否是公开路由
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: UserInfo | undefined = request.user;

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: '未授权：缺少用户信息',
      });
    }

    // 验证用户信息结构
    if (!user.id) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: '未授权：用户信息无效',
      });
    }

    return true;
  }
}




































