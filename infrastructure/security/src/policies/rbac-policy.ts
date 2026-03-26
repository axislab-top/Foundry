/**
 * 基于角色的访问控制（RBAC）策略
 */

import type { Policy, PolicyContext, PolicyResult } from '../types/authorization.types.js';
import { PolicyType } from '../types/authorization.types.js';

export interface RbacPolicyConfig {
  roles: Map<string, string[]>; // 角色 -> 权限映射
}

export class RbacPolicy implements Policy {
  name: string;
  type: PolicyType = PolicyType.RBAC;
  private config: RbacPolicyConfig;

  constructor(name: string, config: RbacPolicyConfig) {
    this.name = name;
    this.config = config;
  }

  evaluate(context: PolicyContext): PolicyResult {
    const { user, action } = context;

    if (!user.roles || user.roles.length === 0) {
      return {
        allowed: false,
        reason: 'User has no roles',
      };
    }

    // 检查用户角色是否有权限执行操作
    for (const role of user.roles) {
      const permissions = this.config.roles.get(role);
      if (permissions && action && permissions.includes(action)) {
        return {
          allowed: true,
        };
      }
    }

    return {
      allowed: false,
      reason: 'User does not have required permissions',
    };
  }
}






































