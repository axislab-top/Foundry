/**
 * 策略引擎
 */

import type { Policy, PolicyContext, PolicyResult } from '../types/authorization.types.js';

export class PolicyEngine {
  private policies: Map<string, Policy> = new Map();

  constructor(policies: Policy[] = []) {
    for (const policy of policies) {
      this.registerPolicy(policy);
    }
  }

  /**
   * 注册策略
   */
  registerPolicy(policy: Policy): void {
    this.policies.set(policy.name, policy);
  }

  /**
   * 移除策略
   */
  removePolicy(policyName: string): void {
    this.policies.delete(policyName);
  }

  /**
   * 获取策略
   */
  getPolicy(policyName: string): Policy | undefined {
    return this.policies.get(policyName);
  }

  /**
   * 评估所有策略
   */
  async evaluate(context: PolicyContext): Promise<PolicyResult> {
    // 按顺序评估所有策略
    for (const policy of this.policies.values()) {
      const result = await Promise.resolve(policy.evaluate(context));
      if (!result.allowed) {
        return result;
      }
    }

    // 如果没有策略或所有策略都允许，则允许访问
    return {
      allowed: true,
    };
  }

  /**
   * 评估特定策略
   */
  async evaluatePolicy(
    policyName: string,
    context: PolicyContext,
  ): Promise<PolicyResult> {
    const policy = this.policies.get(policyName);
    if (!policy) {
      return {
        allowed: false,
        reason: `Policy not found: ${policyName}`,
      };
    }

    return Promise.resolve(policy.evaluate(context));
  }
}






































