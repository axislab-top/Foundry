/**
 * 缓存配置管理
 */

export * from '../types/index.js';

/**
 * 从环境变量创建 Redis 配置
 */
export function createRedisConfigFromEnv(): import('../types').RedisCacheOptions {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : undefined,
    url: process.env.REDIS_URL,
    keyPrefix: process.env.REDIS_KEY_PREFIX,
  };
}

/**
 * 从环境变量创建 Memcached 配置
 */
export function createMemcachedConfigFromEnv(): import('../types').MemcachedCacheOptions {
  const hosts = process.env.MEMCACHED_HOSTS || 'localhost:11211';
  return {
    hosts: hosts.includes(',') ? hosts.split(',') : hosts,
    keyPrefix: process.env.MEMCACHED_KEY_PREFIX,
  };
}

/**
 * 从环境变量创建 Memory 配置
 */
export function createMemoryConfigFromEnv(): import('../types').MemoryCacheOptions {
  return {
    maxSize: process.env.CACHE_MAX_SIZE ? parseInt(process.env.CACHE_MAX_SIZE, 10) : 1000,
    ttl: process.env.CACHE_TTL ? parseInt(process.env.CACHE_TTL, 10) : 0,
    keyPrefix: process.env.CACHE_KEY_PREFIX,
  };
}





