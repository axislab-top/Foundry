import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator.js';

/**
 * JWT 认证守卫
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // 检查是否是公开路由
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // 若前置中间件已注入 request.user（例如 API Key 签名认证），直接放行
    const request = context.switchToHttp().getRequest();
    const existingUser = request?.user;
    if (existingUser?.id) {
      return true;
    }

    // 对于非公开路由，尝试验证 token
    // 但如果 token 缺失，允许请求继续（由路由服务决定是否需要认证）
    try {
      return super.canActivate(context);
    } catch (error) {
      // 如果是因为 token 缺失而失败，允许继续（返回 true）
      // 路由服务会根据 authRequired 检查是否有 user
      // 如果是因为 token 无效而失败，重新抛出异常
      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers['authorization'];
      
      // 如果没有 Authorization 头，允许继续（路由服务会检查）
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return true;
      }
      
      // 如果有 Authorization 头但验证失败，抛出异常
      throw error;
    }
  }

  handleRequest(err: any, user: any, info: any) {
    // 如果有错误，抛出异常
    if (err) {
      throw err;
    }
    
    // 如果有 info（通常是 token 验证失败的信息），抛出异常
    if (info) {
      throw new UnauthorizedException({
        message: info.message || 'Token validation failed',
        error: info.name || 'Unauthorized',
      });
    }
    
    // 如果没有用户，抛出异常（对于需要认证的路由）
    if (!user) {
      throw new UnauthorizedException({
        message: 'User not authenticated',
        error: 'Unauthorized',
      });
    }
    
    return user;
  }
}


















