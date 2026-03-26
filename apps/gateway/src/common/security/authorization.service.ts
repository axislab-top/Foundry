import { Injectable } from '@nestjs/common';
import {
  AuthorizationManager,
  RbacPolicy,
  AbacPolicy,
} from '@service/security';
import { SecurityService } from './security.service.js';

/**
 * 授权服务
 * 提供 RBAC 和 ABAC 授权策略
 */
@Injectable()
export class AuthorizationService {
  private authorizationManager: AuthorizationManager;

  constructor(private readonly securityService: SecurityService) {
    // NestJS 的依赖注入顺序保证：
    // 1. useFactory 先执行（创建 SECURITY_MANAGER）
    // 2. SecurityService 依赖 SECURITY_MANAGER，在 useFactory 之后创建
    // 3. AuthorizationService 依赖 SecurityService，在 SecurityService 之后创建
    // 所以此时 SecurityManager 已经完全初始化，包括 AuthorizationManager
    this.authorizationManager =
      this.securityService.getAuthorizationManager();
    this.initializePolicies();
  }

  /**
   * 初始化授权策略
   */
  private initializePolicies(): void {
    // RBAC 策略
    const rbacPolicy = new RbacPolicy('default-rbac', {
      roles: new Map([
        [
          'admin',
          [
            'read:users',
            'write:users',
            'delete:users',
            'read:roles',
            'write:roles',
            'read:permissions',
            'write:permissions',
          ],
        ],
        ['user', ['read:users', 'read:profile']],
        ['moderator', ['read:users', 'write:users', 'read:roles']],
      ]),
    });

    this.authorizationManager.registerPolicy(rbacPolicy);

    // ABAC 策略示例
    const abacPolicy = new AbacPolicy('default-abac', {
      rules: [
        {
          subject: { role: 'user' },
          resource: { type: 'profile', owner: '${user.id}' },
          action: 'read',
          effect: 'allow',
        },
        {
          subject: { role: 'user' },
          resource: { type: 'profile', owner: '${user.id}' },
          action: 'write',
          effect: 'allow',
        },
        {
          subject: { department: 'IT' },
          resource: { type: 'server' },
          action: 'manage',
          effect: 'allow',
        },
      ],
    });

    this.authorizationManager.registerPolicy(abacPolicy);
  }

  /**
   * 检查权限（RBAC）
   */
  async checkPermission(
    userRoles: string[],
    requiredPermission: string,
  ): Promise<boolean> {
    for (const role of userRoles) {
      const hasPermission = this.authorizationManager.hasPermission(
        this.getRolePermissions(role),
        [requiredPermission],
      );
      if (hasPermission) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查角色
   */
  hasRole(userRoles: string[], requiredRoles: string[]): boolean {
    return this.authorizationManager.hasRole(userRoles, requiredRoles);
  }

  /**
   * 检查权限（ABAC）
   */
  async checkResourceAccess(
    user: any,
    resource: any,
    action: string,
  ): Promise<boolean> {
    const result = await this.authorizationManager.checkPermission({
      user,
      resource,
      action,
    });
    return result.allowed;
  }

  /**
   * 获取角色的权限列表
   */
  private getRolePermissions(role: string): string[] {
    const rolePermissions: Record<string, string[]> = {
      admin: [
        'read:users',
        'write:users',
        'delete:users',
        'read:roles',
        'write:roles',
        'read:permissions',
        'write:permissions',
      ],
      user: ['read:users', 'read:profile'],
      moderator: ['read:users', 'write:users', 'read:roles'],
    };

    return rolePermissions[role] || [];
  }
}















