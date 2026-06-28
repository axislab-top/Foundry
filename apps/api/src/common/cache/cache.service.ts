import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CacheManager,
  CacheAdapterType,
  CacheAdapter,
} from '@service/cache';
import { createClient } from 'redis';
import { ConfigService } from '../config/config.service.js';
import { serializeUnknownErrorForLog } from '../logging/serialize-unknown-error.js';
import { ICacheService } from './interfaces/cache.interface.js';

function redactRedisUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return url.replace(/:\/\/([^:/?#]+):([^@]+)@/, '://$1:***@');
  }
}

/**
 * 缓存服务
 * 封装 @service/cache 包，提供 NestJS 服务接口
 */
@Injectable()
export class CacheService implements ICacheService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  // Ensure adapter is always available synchronously.
  // Some startup paths (e.g. early RPC handling or other providers' onModuleInit)
  // can call into CacheService before this provider's async onModuleInit finishes.
  private cacheManager: CacheManager = CacheManager.getInstance();
  private adapter: CacheAdapter = this.cacheManager.getAdapter();

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
      // auto: 已配置 Redis 时优先 Redis（与 env.shared.example 说明一致）
      const redisUrl = redisConfig.url?.trim();
      const hasRedis = Boolean(redisUrl) || Boolean(redisConfig.host?.trim());
      if (hasRedis) {
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
        defaultAdapter = CacheAdapterType.MEMORY;
        adapters.push({
          adapter: CacheAdapterType.MEMORY,
          options: {},
        });
      }
    }

    // 创建缓存管理器（可能覆盖构造期的默认 memory adapter）
    CacheManager.reset(); // 重置单例，确保使用新配置
    this.cacheManager = CacheManager.create({
      defaultAdapter,
      adapters,
    });
    this.adapter = this.cacheManager.getAdapter();
    await this.probeRedisTcpAndLog(redisConfig, defaultAdapter);
  }

  /** 启动时打 REDIS_* 快照并做一次独立 TCP 探测（与 @service/cache 适配器解耦）。 */
  private async probeRedisTcpAndLog(
    redisConfig: { host: string; port: number; password?: string; db: number; url?: string },
    defaultAdapter: CacheAdapterType,
  ): Promise<void> {
    const url = redisConfig.url?.trim();
    this.logger.log('api.redis.env_snapshot', {
      service: 'api',
      CACHE_ADAPTER_TYPE: process.env.CACHE_ADAPTER_TYPE || 'auto',
      defaultAdapter: String(defaultAdapter),
      REDIS_URL_configured: Boolean(url),
      REDIS_HOST: redisConfig.host,
      REDIS_PORT: redisConfig.port,
      REDIS_DB: redisConfig.db,
      PASSWORD_set: Boolean(redisConfig.password),
      redactedUrl: url ? redactRedisUrlForLog(url) : null,
    });
    let probeUrl = url;
    if (!probeUrl) {
      const auth = redisConfig.password
        ? `:${encodeURIComponent(redisConfig.password)}@`
        : '';
      probeUrl = `redis://${auth}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`;
    }
    const redactedTarget = url ? redactRedisUrlForLog(url) : `${redisConfig.host}:${redisConfig.port}/db${redisConfig.db}`;
    try {
      const c = createClient({ url: probeUrl });
      await c.connect();
      const pong = await c.ping();
      await c.quit().catch(() => undefined);
      this.logger.log('api.redis.tcp_probe_ok', { redactedTarget, ping: pong });
    } catch (e: unknown) {
      this.logger.warn('api.redis.tcp_probe_failed', {
        redactedTarget,
        fullError: serializeUnknownErrorForLog(e),
      });
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






































