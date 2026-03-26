/**
 * 共享类型定义
 * 用于服务间通信的通用类型
 */

/**
 * 标准响应格式
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

/**
 * API 错误格式
 */
export interface ApiError {
  code: number | string;
  message: string;
  details?: any;
  timestamp?: string;
  path?: string;
}

/**
 * 分页请求参数
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * 分页响应结果
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 查询过滤参数
 */
export interface QueryFilter {
  search?: string;
  [key: string]: any;
}



































