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

  // 认证错误 (2000-2999)
  AUTH_LOGIN_FAILED = 2000,
  AUTH_TOKEN_INVALID = 2001,
  AUTH_TOKEN_EXPIRED = 2002,
  AUTH_TOKEN_MISSING = 2003,
  AUTH_REFRESH_TOKEN_INVALID = 2004,
  AUTH_REFRESH_TOKEN_EXPIRED = 2005,
  AUTH_USER_NOT_FOUND = 2006,
  AUTH_PASSWORD_INCORRECT = 2007,
  AUTH_INSUFFICIENT_PERMISSIONS = 2008,
  AUTH_INVALID_CREDENTIALS = 2009,
  AUTH_SIGNATURE_MISSING = 2010,
  AUTH_SIGNATURE_INVALID = 2011,
  AUTH_SIGNATURE_ALGORITHM_UNSUPPORTED = 2012,

  // 数据错误 (6000-6999)
  RECORD_NOT_FOUND = 6000,
  RECORD_ALREADY_EXISTS = 6001,

  // 限流错误 (3000-3999)
  RATE_LIMIT_EXCEEDED = 3000,
  RATE_LIMIT_IP_EXCEEDED = 3001,
  RATE_LIMIT_USER_EXCEEDED = 3002,
  RATE_LIMIT_API_EXCEEDED = 3003,

  // 路由错误 (4000-4999)
  ROUTING_SERVICE_UNAVAILABLE = 4000,
  ROUTING_SERVICE_TIMEOUT = 4001,
  ROUTING_SERVICE_ERROR = 4002,
  ROUTING_ROUTE_NOT_FOUND = 4003,
  ROUTING_RETRY_EXHAUSTED = 4004,

  // 缓存错误 (5000-5999)
  CACHE_CONNECTION_ERROR = 5000,
  CACHE_OPERATION_FAILED = 5001,
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

  [ErrorCode.AUTH_LOGIN_FAILED]: 'Login failed',
  [ErrorCode.AUTH_TOKEN_INVALID]: 'Invalid token',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Token expired',
  [ErrorCode.AUTH_TOKEN_MISSING]: 'Token missing',
  [ErrorCode.AUTH_REFRESH_TOKEN_INVALID]: 'Invalid refresh token',
  [ErrorCode.AUTH_REFRESH_TOKEN_EXPIRED]: 'Refresh token expired',
  [ErrorCode.AUTH_USER_NOT_FOUND]: 'User not found',
  [ErrorCode.AUTH_PASSWORD_INCORRECT]: 'Incorrect password',
  [ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS]: 'Insufficient permissions',
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 'Invalid credentials',
  [ErrorCode.AUTH_SIGNATURE_MISSING]: 'Request signature is missing',
  [ErrorCode.AUTH_SIGNATURE_INVALID]: 'Request signature is invalid',
  [ErrorCode.AUTH_SIGNATURE_ALGORITHM_UNSUPPORTED]: 'Signature algorithm is not supported',

  [ErrorCode.RECORD_NOT_FOUND]: 'Record not found',
  [ErrorCode.RECORD_ALREADY_EXISTS]: 'Record already exists',

  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
  [ErrorCode.RATE_LIMIT_IP_EXCEEDED]: 'IP rate limit exceeded',
  [ErrorCode.RATE_LIMIT_USER_EXCEEDED]: 'User rate limit exceeded',
  [ErrorCode.RATE_LIMIT_API_EXCEEDED]: 'API rate limit exceeded',

  [ErrorCode.ROUTING_SERVICE_UNAVAILABLE]: 'Service unavailable',
  [ErrorCode.ROUTING_SERVICE_TIMEOUT]: 'Service timeout',
  [ErrorCode.ROUTING_SERVICE_ERROR]: 'Service error',
  [ErrorCode.ROUTING_ROUTE_NOT_FOUND]: 'Route not found',
  [ErrorCode.ROUTING_RETRY_EXHAUSTED]: 'Request retry exhausted',

  [ErrorCode.CACHE_CONNECTION_ERROR]: 'Cache connection error',
  [ErrorCode.CACHE_OPERATION_FAILED]: 'Cache operation failed',
};








