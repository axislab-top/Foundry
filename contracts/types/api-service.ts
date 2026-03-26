/**
 * API 服务类型定义
 * 用于 Gateway 和其他服务调用 API 服务的类型契约
 */

import type { ApiResponse, PaginatedResponse } from './shared.js';

/**
 * 用户信息（不包含敏感信息）
 */
export interface UserInfo {
  id: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
}

/**
 * 用户详细信息
 */
export interface UserDetail extends UserInfo {
  enabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 验证凭证请求
 */
export interface ValidateCredentialsRequest {
  email: string;
  password: string;
}

/**
 * 验证凭证响应
 */
export type ValidateCredentialsResponse = UserInfo;

/**
 * 创建用户请求
 */
export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  roles?: string[];
  permissions?: string[];
  enabled?: boolean;
}

/**
 * 创建用户响应
 */
export type CreateUserResponse = UserDetail;

/**
 * 更新用户请求
 */
export interface UpdateUserRequest {
  username?: string;
  email?: string;
  password?: string;
  roles?: string[];
  permissions?: string[];
  enabled?: boolean;
}

/**
 * 更新用户响应
 */
export type UpdateUserResponse = UserDetail;

/**
 * 查询用户列表请求
 */
export interface QueryUsersRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
  role?: string;
  enabled?: boolean;
}

/**
 * 查询用户列表响应
 */
export type QueryUsersResponse = PaginatedResponse<UserDetail>;

/**
 * 获取用户响应
 */
export type GetUserResponse = UserDetail;

/**
 * API 服务的端点类型映射
 */
export interface ApiServiceEndpoints {
  // Auth 端点
  'POST /api/auth/validate': {
    request: ValidateCredentialsRequest;
    response: ApiResponse<ValidateCredentialsResponse>;
  };

  // Users 端点
  'POST /api/users': {
    request: CreateUserRequest;
    response: ApiResponse<CreateUserResponse>;
  };

  'GET /api/users': {
    request: QueryUsersRequest;
    response: ApiResponse<QueryUsersResponse>;
  };

  'GET /api/users/:id': {
    request: { id: string };
    response: ApiResponse<GetUserResponse>;
  };

  'PATCH /api/users/:id': {
    request: UpdateUserRequest & { id: string };
    response: ApiResponse<UpdateUserResponse>;
  };

  'DELETE /api/users/:id': {
    request: { id: string };
    response: ApiResponse<{ message: string }>;
  };
}



































