/**
 * 授权相关类型定义
 */

export enum PolicyType {
  RBAC = 'rbac',
  ABAC = 'abac',
  ACL = 'acl',
}

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface Role {
  name: string;
  permissions: Permission[];
  inherits?: string[];
}

export interface PolicyContext {
  user: {
    id: string;
    roles?: string[];
    permissions?: string[];
    attributes?: Record<string, any>;
  };
  resource?: {
    type: string;
    id?: string;
    attributes?: Record<string, any>;
  };
  action?: string;
  environment?: Record<string, any>;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  conditions?: Record<string, any>;
}

export interface Policy {
  name: string;
  type: PolicyType;
  evaluate(context: PolicyContext): Promise<PolicyResult> | PolicyResult;
}






































