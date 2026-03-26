/**
 * 缓存类型定义
 */

/**
 * 缓存适配器类型
 */
export enum CacheAdapterType {
  REDIS = 'redis',
  MEMORY = 'memory',
  MEMCACHED = 'memcached'
}

/**
 * 缓存适配器接口
 */
export interface CacheAdapter {
  /**
   * 获取缓存值
   */
  get<T = any>(key: string): Promise<T | null>;

  /**
   * 设置缓存值
   */
  set<T = any>(key: string, value: T, ttl?: number): Promise<boolean>;

  /**
   * 删除缓存
   */
  delete(key: string): Promise<boolean>;

  /**
   * 批量删除缓存
   */
  deleteMany(keys: string[]): Promise<number>;

  /**
   * 检查键是否存在
   */
  exists(key: string): Promise<boolean>;

  /**
   * 设置过期时间
   */
  expire(key: string, ttl: number): Promise<boolean>;

  /**
   * 获取剩余过期时间（秒）
   */
  ttl(key: string): Promise<number>;

  /**
   * 清空所有缓存（谨慎使用）
   */
  clear(): Promise<boolean>;

  /**
   * 获取多个键的值
   */
  getMany<T = any>(keys: string[]): Promise<(T | null)[]>;

  /**
   * 设置多个键值对
   */
  setMany<T = any>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<boolean>;

  /**
   * 递增
   */
  increment(key: string, amount?: number): Promise<number>;

  /**
   * 递减
   */
  decrement(key: string, amount?: number): Promise<number>;

  /**
   * 关闭连接（清理资源）
   */
  close(): Promise<void>;
}

/**
 * Redis 配置选项
 */
export interface RedisCacheOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  url?: string;
  keyPrefix?: string;
  connectTimeout?: number;
  commandTimeout?: number;
  retryStrategy?: (times: number) => number | Error;
}

/**
 * Memory 配置选项
 */
export interface MemoryCacheOptions {
  maxSize?: number; // 最大条目数
  ttl?: number; // 默认 TTL（秒）
  checkInterval?: number; // 清理过期条目的间隔（秒）
  keyPrefix?: string;
}

/**
 * Memcached 配置选项
 */
export interface MemcachedCacheOptions {
  hosts: string | string[]; // 'host:port' 或 ['host:port', ...]
  keyPrefix?: string;
  timeout?: number;
  retries?: number;
  failures?: number;
  retry?: number;
  remove?: boolean;
  poolSize?: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  adapter: CacheAdapterType;
  options?: RedisCacheOptions | MemoryCacheOptions | MemcachedCacheOptions;
}

/**
 * 缓存管理器配置
 */
export interface CacheManagerConfig {
  defaultAdapter?: CacheAdapterType;
  adapters?: CacheConfig[];
}












































