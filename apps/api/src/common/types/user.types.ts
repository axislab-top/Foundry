/**
 * 用户信息类型
 * 从 Gateway 传递的用户信息
 */
/** API 内鉴权 actor（用户或内部服务账号） */
export interface Actor {
  id: string;
  roles?: string[];
}

/** 协作/任务链路中的 actor 引用（与 Actor 同构） */
export type ActorRef = Actor;

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






































