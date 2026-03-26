import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserInfo } from '../types/user.types.js';

/**
 * 当前用户装饰器
 * 从请求中提取用户信息（由 Gateway 注入）
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserInfo | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);






































