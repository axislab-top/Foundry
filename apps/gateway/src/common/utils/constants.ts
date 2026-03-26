/**
 * 通用常量
 */
export const GATEWAY_CONSTANTS = {
  // 服务名称
  SERVICE_NAME: 'gateway-service',

  // 默认端口
  DEFAULT_PORT: 3002,

  // 请求头
  HEADERS: {
    REQUEST_ID: 'x-request-id',
    AUTHORIZATION: 'authorization',
    CONTENT_TYPE: 'content-type',
    USER_AGENT: 'user-agent',
  },

  // 超时时间（毫秒）
  TIMEOUT: {
    DEFAULT: 30000,
    SHORT: 10000,
    LONG: 60000,
  },
} as const;









































