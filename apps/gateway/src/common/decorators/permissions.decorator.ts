import { SetMetadata } from '@nestjs/common';

/**
 * 权限装饰器
 * 标记需要特定权限的路由
 */
export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);









































