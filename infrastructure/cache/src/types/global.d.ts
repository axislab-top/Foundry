/**
 * 全局类型定义
 */

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      REDIS_HOST?: string;
      REDIS_PORT?: string;
      REDIS_PASSWORD?: string;
      REDIS_DB?: string;
      REDIS_URL?: string;
      REDIS_KEY_PREFIX?: string;
      MEMCACHED_HOSTS?: string;
      MEMCACHED_KEY_PREFIX?: string;
      CACHE_MAX_SIZE?: string;
      CACHE_TTL?: string;
      CACHE_KEY_PREFIX?: string;
    }
  }
}

export {};












































