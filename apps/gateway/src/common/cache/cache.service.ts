import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CacheManager,
  CacheAdapterType,
  CacheAdapter,
} from '@service/cache';
import { createClient } from 'redis';
import { ConfigService } from '../config/config.service.js';
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

function serializeProbeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * 缓存服务
 * 封装 @service/cache 包，提供 NestJS 服务接口
 */
@Injectable()
export class CacheService implements ICacheService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private cacheManager: CacheManager = CacheManager.getInstance();
  private adapter: CacheAdapter = this.cacheManager.getAdapter();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = this.configService.getRedisConfig();
    const cacheAdapterType = process.env.CACHE_ADAPTER_TYPE || 'auto';

    let defaultAdapter: CacheAdapterType;
    const adapters: Array<{ adapter: CacheAdapterType; options?: Record<string, unknown> }> = [];

    if (cacheAdapterType === 'memory') {
      defaultAdapter = CacheAdapterType.MEMORY;
      adapters.push({
        adapter: CacheAdapterType.MEMORY,
        options: {},
      });
    } else if (cacheAdapterType === 'redis') {
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
        this.logger.warn(
          'CACHE_ADAPTER_TYPE=auto but no REDIS_HOST/REDIS_URL; auth refresh sessions will not survive gateway restarts',
        );
      }
    }

    CacheManager.reset();
    this.cacheManager = CacheManager.create({
      defaultAdapter,
      adapters,
    });
    this.adapter = this.cacheManager.getAdapter();
    await this.probeRedisTcpAndLog(redisConfig, defaultAdapter);
  }

  private async probeRedisTcpAndLog(
    redisConfig: { host: string; port: number; password?: string; db: number; url?: string },
    defaultAdapter: CacheAdapterType,
  ): Promise<void> {
    const url = redisConfig.url?.trim();
    this.logger.log('gateway.redis.env_snapshot', {
      service: 'gateway',
      CACHE_ADAPTER_TYPE: process.env.CACHE_ADAPTER_TYPE || 'auto',
      defaultAdapter: String(defaultAdapter),
      REDIS_URL_configured: Boolean(url),
      REDIS_HOST: redisConfig.host,
      REDIS_PORT: redisConfig.port,
      REDIS_DB: redisConfig.db,
      PASSWORD_set: Boolean(redisConfig.password),
      redactedUrl: url ? redactRedisUrlForLog(url) : null,
    });

    if (defaultAdapter !== CacheAdapterType.REDIS) {
      return;
    }

    let probeUrl = url;
    if (!probeUrl) {
      const auth = redisConfig.password
        ? `:${encodeURIComponent(redisConfig.password)}@`
        : '';
      probeUrl = `redis://${auth}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`;
    }
    const redactedTarget = url
      ? redactRedisUrlForLog(url)
      : `${redisConfig.host}:${redisConfig.port}/db${redisConfig.db}`;
    try {
      const client = createClient({ url: probeUrl });
      await client.connect();
      const pong = await client.ping();
      await client.quit().catch(() => undefined);
      this.logger.log('gateway.redis.tcp_probe_ok', { redactedTarget, ping: pong });
    } catch (error: unknown) {
      this.logger.warn('gateway.redis.tcp_probe_failed', {
        redactedTarget,
        error: serializeProbeError(error),
      });
    }
  }

  async onModuleDestroy() {
    if (this.cacheManager) {
      await this.cacheManager.closeAll();
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return this.adapter.get<T>(key);
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<boolean> {
    return this.adapter.set(key, value, ttl);
  }

  async delete(key: string): Promise<boolean> {
    return this.adapter.delete(key);
  }

  async deleteMany(keys: string[]): Promise<number> {
    return this.adapter.deleteMany(keys);
  }

  async exists(key: string): Promise<boolean> {
    return this.adapter.exists(key);
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    return this.adapter.expire(key, ttl);
  }

  async ttl(key: string): Promise<number> {
    return this.adapter.ttl(key);
  }

  async clear(): Promise<boolean> {
    return this.adapter.clear();
  }

  async getMany<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    return this.adapter.getMany<T>(keys);
  }

  async setMany<T = unknown>(
    items: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<boolean> {
    return this.adapter.setMany(items);
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    return this.adapter.increment(key, amount);
  }

  async decrement(key: string, amount: number = 1): Promise<number> {
    return this.adapter.decrement(key, amount);
  }
}
