import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserInfo } from '../../modules/auth/interfaces/auth-result.interface.js';

/**
 * 当前用户装饰器
 * 从请求中提取用户信息
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserInfo => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);


