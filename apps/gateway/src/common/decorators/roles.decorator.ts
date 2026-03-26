import { SetMetadata } from '@nestjs/common';

/**
 * 角色装饰器
 * 标记需要特定角色的路由
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);









































