/**
 * 错误码定义
 */
export enum ErrorCode {
  // 通用错误 (1000-1999)
  INTERNAL_ERROR = 1000,
  VALIDATION_ERROR = 1001,
  NOT_FOUND = 1002,
  UNAUTHORIZED = 1003,
  FORBIDDEN = 1004,
  BAD_REQUEST = 1005,

  // 数据库错误 (2000-2999)
  DATABASE_CONNECTION_ERROR = 2000,
  DATABASE_QUERY_ERROR = 2001,
  DATABASE_TRANSACTION_ERROR = 2002,
  RECORD_NOT_FOUND = 2003,
  RECORD_ALREADY_EXISTS = 2004,

  // 缓存错误 (3000-3999)
  CACHE_CONNECTION_ERROR = 3000,
  CACHE_OPERATION_FAILED = 3001,

  // 业务错误 (4000-4999)
  BUSINESS_LOGIC_ERROR = 4000,
  RESOURCE_CONFLICT = 4001,
  OPERATION_NOT_ALLOWED = 4002,
}

/**
 * 错误消息映射
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCode.INTERNAL_ERROR]: 'Internal server error',
  [ErrorCode.VALIDATION_ERROR]: 'Validation error',
  [ErrorCode.NOT_FOUND]: 'Resource not found',
  [ErrorCode.UNAUTHORIZED]: 'Unauthorized',
  [ErrorCode.FORBIDDEN]: 'Forbidden',
  [ErrorCode.BAD_REQUEST]: 'Bad request',

  [ErrorCode.DATABASE_CONNECTION_ERROR]: 'Database connection error',
  [ErrorCode.DATABASE_QUERY_ERROR]: 'Database query error',
  [ErrorCode.DATABASE_TRANSACTION_ERROR]: 'Database transaction error',
  [ErrorCode.RECORD_NOT_FOUND]: 'Record not found',
  [ErrorCode.RECORD_ALREADY_EXISTS]: 'Record already exists',

  [ErrorCode.CACHE_CONNECTION_ERROR]: 'Cache connection error',
  [ErrorCode.CACHE_OPERATION_FAILED]: 'Cache operation failed',

  [ErrorCode.BUSINESS_LOGIC_ERROR]: 'Business logic error',
  [ErrorCode.RESOURCE_CONFLICT]: 'Resource conflict',
  [ErrorCode.OPERATION_NOT_ALLOWED]: 'Operation not allowed',
};






































