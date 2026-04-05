/**
 * 用户信息类型
 * 从 Gateway 传递的用户信息
 */
export interface UserInfo {
  id: string;
  username: string;
  email?: string;
  companyId?: string;
  roles?: string[];
  permissions?: string[];
  /** 用户所属组织节点（部门记忆访问控制，由网关/JWT 可选注入） */
  organizationNodeIds?: string[];
}






































