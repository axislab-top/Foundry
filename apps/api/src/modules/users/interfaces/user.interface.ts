/**
 * 用户接口定义
 */

/**
 * 用户数据接口
 */
export interface IUser {
  id: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  enabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * 用户信息接口（不包含敏感信息）
 */
export interface IUserInfo {
  id: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
}

/**
 * 分页查询结果接口
 */
export interface IPaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 查询选项接口
 */
export interface IQueryOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
  role?: string;
  enabled?: boolean;
}





































