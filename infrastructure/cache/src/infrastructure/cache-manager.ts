/**
 * 缓存管理器
 * 
 * 提供统一的缓存接口，支持多种后端适配器
 */

import { 
  CacheAdapter, 
  CacheAdapterType, 
  CacheConfig, 
  CacheManagerConfig,
  RedisCacheOptions,
  MemoryCacheOptions,
  MemcachedCacheOptions
} from '../types/index.js';
import { RedisCacheAdapter } from '../adapters/redis-cache-adapter.js';
import { MemoryCacheAdapter } from '../adapters/memory-cache-adapter.js';
import { MemcachedCacheAdapter } from '../adapters/memcached-cache-adapter.js';

/**
 * 缓存管理器类
 */
export class CacheManager {
  private static instance: CacheManager | null = null;
  private adapters: Map<CacheAdapterType, CacheAdapter> = new Map();
  private defaultAdapterType: CacheAdapterType;

  private constructor(config: CacheManagerConfig = {}) {
    this.defaultAdapterType = config.defaultAdapter || CacheAdapterType.MEMORY;

    // 初始化适配器
    if (config.adapters && config.adapters.length > 0) {
      for (const adapterConfig of config.adapters) {
        const adapter = this.createAdapter(adapterConfig.adapter, adapterConfig.options);
        this.adapters.set(adapterConfig.adapter, adapter);
      }
    } else {
      // 如果没有配置适配器，创建默认的内存适配器
      const defaultAdapter = this.createAdapter(CacheAdapterType.MEMORY);
      this.adapters.set(CacheAdapterType.MEMORY, defaultAdapter);
    }
  }

  /**
   * 创建缓存管理器实例（单例模式）
   */
  static create(config: CacheManagerConfig = {}): CacheManager {
    // 如果配置不同，重置实例
    if (CacheManager.instance) {
      // 检查配置是否相同，如果不同则重置
      const currentDefault = CacheManager.instance.defaultAdapterType;
      const newDefault = config.defaultAdapter || CacheAdapterType.MEMORY;
      if (currentDefault !== newDefault) {
        CacheManager.reset();
      }
    }
    
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(config);
    }
    return CacheManager.instance;
  }

  /**
   * 获取单例实例
   */
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * 重置单例（主要用于测试）
   */
  static reset(): void {
    if (CacheManager.instance) {
      CacheManager.instance.closeAll();
      CacheManager.instance = null;
    }
  }

  /**
   * 创建适配器实例
   */
  private createAdapter(
    type: CacheAdapterType,
    options?: RedisCacheOptions | MemoryCacheOptions | MemcachedCacheOptions
  ): CacheAdapter {
    switch (type) {
      case CacheAdapterType.REDIS:
        return new RedisCacheAdapter(options as RedisCacheOptions);
      
      case CacheAdapterType.MEMORY:
        return new MemoryCacheAdapter(options as MemoryCacheOptions);
      
      case CacheAdapterType.MEMCACHED:
        if (!options || !('hosts' in options)) {
          throw new Error('Memcached adapter requires hosts option');
        }
        return new MemcachedCacheAdapter(options as MemcachedCacheOptions);
      
      default:
        throw new Error(`Unsupported cache adapter type: ${type}`);
    }
  }

  /**
   * 获取适配器
   */
  getAdapter(type?: CacheAdapterType): CacheAdapter {
    const adapterType = type || this.defaultAdapterType;
    const adapter = this.adapters.get(adapterType);
    
    if (!adapter) {
      throw new Error(`Cache adapter not found: ${adapterType}`);
    }
    
    return adapter;
  }

  /**
   * 添加适配器
   */
  addAdapter(type: CacheAdapterType, options?: any): void {
    const adapter = this.createAdapter(type, options);
    this.adapters.set(type, adapter);
  }

  /**
   * 移除适配器
   */
  removeAdapter(type: CacheAdapterType): void {
    const adapter = this.adapters.get(type);
    if (adapter) {
      adapter.close();
      this.adapters.delete(type);
    }
  }

  /**
   * 关闭所有适配器
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.adapters.values()).map(adapter => adapter.close());
    await Promise.all(closePromises);
    this.adapters.clear();
  }

  // 便捷方法：使用默认适配器

  async get<T = any>(key: string, adapterType?: CacheAdapterType): Promise<T | null> {
    return this.getAdapter(adapterType).get<T>(key);
  }

  async set<T = any>(key: string, value: T, ttl?: number, adapterType?: CacheAdapterType): Promise<boolean> {
    return this.getAdapter(adapterType).set(key, value, ttl);
  }

  async delete(key: string, adapterType?: CacheAdapterType): Promise<boolean> {
    return this.getAdapter(adapterType).delete(key);
  }

  async deleteMany(keys: string[], adapterType?: CacheAdapterType): Promise<number> {
    return this.getAdapter(adapterType).deleteMany(keys);
  }

  async exists(key: string, adapterType?: CacheAdapterType): Promise<boolean> {
    return this.getAdapter(adapterType).exists(key);
  }

  async expire(key: string, ttl: number, adapterType?: CacheAdapterType): Promise<boolean> {
    return this.getAdapter(adapterType).expire(key, ttl);
  }

  async ttl(key: string, adapterType?: CacheAdapterType): Promise<number> {
    return this.getAdapter(adapterType).ttl(key);
  }

  async clear(adapterType?: CacheAdapterType): Promise<boolean> {
    return this.getAdapter(adapterType).clear();
  }

  async getMany<T = any>(keys: string[], adapterType?: CacheAdapterType): Promise<(T | null)[]> {
    return this.getAdapter(adapterType).getMany<T>(keys);
  }

  async setMany<T = any>(
    items: Array<{ key: string; value: T; ttl?: number }>,
    adapterType?: CacheAdapterType
  ): Promise<boolean> {
    return this.getAdapter(adapterType).setMany(items);
  }

  async increment(key: string, amount?: number, adapterType?: CacheAdapterType): Promise<number> {
    return this.getAdapter(adapterType).increment(key, amount);
  }

  async decrement(key: string, amount?: number, adapterType?: CacheAdapterType): Promise<number> {
    return this.getAdapter(adapterType).decrement(key, amount);
  }
}





