/**
 * 授权管理器
 */

import type { Policy, PolicyContext, PolicyResult } from '../types/authorization.types.js';
import { PolicyEngine } from '../policies/policy-engine.js';

export interface AuthorizationManagerConfig {
  policies?: Policy[];
}

export class AuthorizationManager {
  private static instance: AuthorizationManager | null = null;
  private policyEngine: PolicyEngine;

  private constructor(config: AuthorizationManagerConfig = {}) {
    this.policyEngine = new PolicyEngine(config.policies || []);
  }

  static create(config?: AuthorizationManagerConfig): AuthorizationManager {
    if (!AuthorizationManager.instance) {
      AuthorizationManager.instance = new AuthorizationManager(config);
    }
    return AuthorizationManager.instance;
  }

  static getInstance(): AuthorizationManager {
    if (!AuthorizationManager.instance) {
      throw new Error('AuthorizationManager not initialized. Call create() first.');
    }
    return AuthorizationManager.instance;
  }

  static reset(): void {
    AuthorizationManager.instance = null;
  }

  /**
   * 检查权限
   */
  async checkPermission(context: PolicyContext): Promise<PolicyResult> {
    return this.policyEngine.evaluate(context);
  }

  /**
   * 检查用户是否有指定角色
   */
  hasRole(userRoles: string[] | undefined, requiredRoles: string[]): boolean {
    if (!userRoles || userRoles.length === 0) {
      return false;
    }
    return requiredRoles.some((role) => userRoles.includes(role));
  }

  /**
   * 检查用户是否有指定权限
   */
  hasPermission(
    userPermissions: string[] | undefined,
    requiredPermissions: string[],
  ): boolean {
    if (!userPermissions || userPermissions.length === 0) {
      return false;
    }
    return requiredPermissions.some((permission) =>
      userPermissions.includes(permission),
    );
  }

  /**
   * 注册策略
   */
  registerPolicy(policy: Policy): void {
    this.policyEngine.registerPolicy(policy);
  }

  /**
   * 移除策略
   */
  removePolicy(policyName: string): void {
    this.policyEngine.removePolicy(policyName);
  }
}






































