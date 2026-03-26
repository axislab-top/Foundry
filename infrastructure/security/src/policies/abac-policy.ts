/**
 * 基于属性的访问控制（ABAC）策略
 */

import type { Policy, PolicyContext, PolicyResult } from '../types/authorization.types.js';
import { PolicyType } from '../types/authorization.types.js';

export interface AbacRule {
  subject?: Record<string, any>; // 主体属性条件
  resource?: Record<string, any>; // 资源属性条件
  action?: string | string[]; // 允许的操作
  environment?: Record<string, any>; // 环境条件
  effect: 'allow' | 'deny';
}

export interface AbacPolicyConfig {
  rules: AbacRule[];
}

export class AbacPolicy implements Policy {
  name: string;
  type: PolicyType = PolicyType.ABAC;
  private config: AbacPolicyConfig;

  constructor(name: string, config: AbacPolicyConfig) {
    this.name = name;
    this.config = config;
  }

  evaluate(context: PolicyContext): PolicyResult {
    const { user, resource, action, environment } = context;

    // 按顺序评估规则
    for (const rule of this.config.rules) {
      if (this.matchesRule(rule, user, resource, action, environment)) {
        return {
          allowed: rule.effect === 'allow',
          reason: rule.effect === 'allow' ? undefined : 'Rule denied access',
          conditions: rule,
        };
      }
    }

    // 默认拒绝
    return {
      allowed: false,
      reason: 'No matching rule found',
    };
  }

  private matchesRule(
    rule: AbacRule,
    user: PolicyContext['user'],
    resource: PolicyContext['resource'],
    action: string | undefined,
    environment: Record<string, any> | undefined,
  ): boolean {
    // 检查主体属性
    if (rule.subject) {
      if (!this.matchesAttributes(rule.subject, user.attributes || {})) {
        return false;
      }
    }

    // 检查资源属性
    if (rule.resource && resource) {
      if (!this.matchesAttributes(rule.resource, resource.attributes || {})) {
        return false;
      }
    }

    // 检查操作
    if (rule.action) {
      const allowedActions = Array.isArray(rule.action) ? rule.action : [rule.action];
      if (!action || !allowedActions.includes(action)) {
        return false;
      }
    }

    // 检查环境条件
    if (rule.environment && environment) {
      if (!this.matchesAttributes(rule.environment, environment)) {
        return false;
      }
    }

    return true;
  }

  private matchesAttributes(
    conditions: Record<string, any>,
    attributes: Record<string, any>,
  ): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      if (attributes[key] !== value) {
        return false;
      }
    }
    return true;
  }
}






































