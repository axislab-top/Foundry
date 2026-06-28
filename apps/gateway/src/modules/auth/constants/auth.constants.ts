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

  // 缓存过期时间（秒）；REFRESH_TOKEN 运行时由 JWT_REFRESH_EXPIRES_IN 覆盖
  CACHE_TTL: {
    USER: 3600, // 1小时
    TOKEN: 900, // 15分钟
    REFRESH_TOKEN: 604800, // 7天（默认，与 JWT_REFRESH_EXPIRES_IN 未配置时一致）
    BLACKLIST: 86400, // 24小时
    /** 轮换后旧 refresh 的幂等宽限期（多标签页并发刷新） */
    REFRESH_ROTATION_GRACE: 90,
  },

  CACHE_PREFIX_GRACE: 'auth:refresh:grace:',

  // 请求头
  HEADERS: {
    AUTHORIZATION: 'Authorization',
    BEARER_PREFIX: 'Bearer ',
  },
} as const;









































