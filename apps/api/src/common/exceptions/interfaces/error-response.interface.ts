/**
 * 错误响应接口
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: number;
    message: string;
    details?: any;
    timestamp: string;
    path: string;
  };
}

/**
 * 成功响应接口
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp?: string;
}

/**
 * API 响应类型
 */
export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;






































