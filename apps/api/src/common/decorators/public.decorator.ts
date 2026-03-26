import { SetMetadata } from '@nestjs/common';

/**
 * 公开路由装饰器
 * 标记不需要认证的路由
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);






































