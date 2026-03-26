import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  CacheManager,
  CacheAdapterType,
  CacheAdapter,
} from '@service/cache';
import { ConfigService } from '../config/config.service.js';
import { ICacheService } from './interfaces/cache.interface.js';

/**
 * 缓存服务
 * 封装 @service/cache 包，提供 NestJS 服务接口
 */
@Injectable()
export class CacheService implements ICacheService, OnModuleInit, OnModuleDestroy {
  private cacheManager: CacheManager;
  private adapter: CacheAdapter;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = this.configService.getRedisConfig();
    const cacheAdapterType = process.env.CACHE_ADAPTER_TYPE || 'auto';
    
    // 根据配置选择缓存适配器
    let defaultAdapter: CacheAdapterType;
    const adapters: Array<{ adapter: CacheAdapterType; options?: any }> = [];

    if (cacheAdapterType === 'memory') {
      // 强制使用内存缓存
      defaultAdapter = CacheAdapterType.MEMORY;
      adapters.push({
        adapter: CacheAdapterType.MEMORY,
        options: {},
      });
    } else if (cacheAdapterType === 'redis') {
      // 强制使用 Redis
      defaultAdapter = CacheAdapterType.REDIS;
      adapters.push({
        adapter: CacheAdapterType.REDIS,
        options: {
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
          url: redisConfig.url,
        },
      });
    } else {
      // auto: 先创建内存缓存作为后备
      defaultAdapter = CacheAdapterType.MEMORY;
      adapters.push({
        adapter: CacheAdapterType.MEMORY,
        options: {},
      });
    }

    // 创建缓存管理器
    CacheManager.reset(); // 重置单例，确保使用新配置
    this.cacheManager = CacheManager.create({
      defaultAdapter,
      adapters,
    });
    this.adapter = this.cacheManager.getAdapter();

    // 如果是 auto 模式，尝试使用 Redis（快速失败，避免资源占用）
    if (cacheAdapterType === 'auto') {
      // 不立即测试，让 Redis 适配器在首次使用时失败
      // 这样可以避免启动时的连接尝试占用资源
      // 如果 Redis 可用，会在首次使用时自动连接
    }
  }

  async onModuleDestroy() {
    if (this.cacheManager) {
      await this.cacheManager.closeAll();
    }
  }

  /**
   * 获取缓存值
   */
  async get<T = any>(key: string): Promise<T | null> {
    return this.adapter.get<T>(key);
  }

  /**
   * 设置缓存值
   */
  async set<T = any>(
    key: string,
    value: T,
    ttl?: number,
  ): Promise<boolean> {
    return this.adapter.set(key, value, ttl);
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<boolean> {
    return this.adapter.delete(key);
  }

  /**
   * 批量删除缓存
   */
  async deleteMany(keys: string[]): Promise<number> {
    return this.adapter.deleteMany(keys);
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<boolean> {
    return this.adapter.exists(key);
  }

  /**
   * 设置过期时间
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    return this.adapter.expire(key, ttl);
  }

  /**
   * 获取剩余过期时间（秒）
   */
  async ttl(key: string): Promise<number> {
    return this.adapter.ttl(key);
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<boolean> {
    return this.adapter.clear();
  }

  /**
   * 获取多个键的值
   */
  async getMany<T = any>(keys: string[]): Promise<(T | null)[]> {
    return this.adapter.getMany<T>(keys);
  }

  /**
   * 设置多个键值对
   */
  async setMany<T = any>(
    items: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<boolean> {
    return this.adapter.setMany(items);
  }

  /**
   * 递增
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    return this.adapter.increment(key, amount);
  }

  /**
   * 递减
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    return this.adapter.decrement(key, amount);
  }
}


