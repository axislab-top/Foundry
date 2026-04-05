/**
 * 用户类型定义
 */
export interface User {
  id: string;
  email?: string;
  username?: string;
  companyId?: string;
  roles?: string[];
  permissions?: string[];
  /** 可选：部门记忆访问控制 */
  organizationNodeIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}









































