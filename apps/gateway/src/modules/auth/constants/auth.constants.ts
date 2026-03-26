/**
 * 认证常量
 */
export const AUTH_CONSTANTS = {
  // 缓存键前缀
  CACHE_PREFIX: {
    USER: 'auth:user:',
    TOKEN: 'auth:token:',
    REFRESH_TOKEN: 'auth:refresh:',
    BLACKLIST: 'auth:blacklist:',
  },

  // 缓存过期时间（秒）
  CACHE_TTL: {
    USER: 3600, // 1小时
    TOKEN: 900, // 15分钟
    REFRESH_TOKEN: 604800, // 7天
    BLACKLIST: 86400, // 24小时
  },

  // 请求头
  HEADERS: {
    AUTHORIZATION: 'Authorization',
    BEARER_PREFIX: 'Bearer ',
  },
} as const;









































