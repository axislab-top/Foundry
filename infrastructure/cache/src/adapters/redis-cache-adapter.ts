/**
 * Redis 缓存适配器
 */

import { createClient, RedisClientType } from 'redis';
import { BaseCacheAdapter } from './cache-adapter.interface.js';
import { RedisCacheOptions } from '../types/index.js';

export class RedisCacheAdapter extends BaseCacheAdapter {
  private client: RedisClientType;
  private isConnected: boolean = false;
  private connectionFailed: boolean = false;
  private connecting: boolean = false;

  constructor(options: RedisCacheOptions = {}) {
    super(options.keyPrefix || '');

    // redis 客户端类型在不同版本间变化较大，这里以运行时字段为准
    const clientOptions: any = {
      socket: {
        reconnectStrategy: false, // 禁用自动重连，避免无限重试
      },
    };

    if (options.url) {
      clientOptions.url = options.url;
    } else {
      clientOptions.socket = {
        ...clientOptions.socket,
        host: options.host || 'localhost',
        port: options.port || 6379,
        connectTimeout: options.connectTimeout || 5000, // 减少超时时间
      };
      if (options.password) {
        clientOptions.password = options.password;
      }
    }

    if (options.db !== undefined) {
      clientOptions.database = options.db;
    }

    if (options.commandTimeout && clientOptions.socket) {
      clientOptions.socket.connectTimeout = options.commandTimeout;
    }

    this.client = createClient(clientOptions) as RedisClientType;

    this.client.on('error', (err: any) => {
      // 只在第一次错误时输出，避免日志刷屏
      if (!this.connectionFailed) {
        console.error('Redis Client Error:', err.message);
        this.connectionFailed = true;
      }
      this.isConnected = false;
      this.connecting = false;
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      this.connectionFailed = false;
      this.connecting = false;
    });

    this.client.on('disconnect', () => {
      this.isConnected = false;
      this.connecting = false;
    });
  }

  /**
   * 确保连接
   */
  private async ensureConnected(): Promise<void> {
    // 如果连接已失败，不再尝试
    if (this.connectionFailed) {
      throw new Error('Redis connection failed and will not retry');
    }

    // 如果正在连接，等待
    if (this.connecting) {
      return;
    }

    if (!this.isConnected) {
      this.connecting = true;
      try {
        await Promise.race([
          this.client.connect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 5000)
          ),
        ]);
        this.isConnected = true;
        this.connectionFailed = false;
      } catch (error: any) {
        this.connectionFailed = true;
        this.isConnected = false;
        throw error;
      } finally {
        this.connecting = false;
      }
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    await this.ensureConnected();
    const prefixedKey = this.prefixKey(key);
    const value = await this.client.get(prefixedKey);
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      // 如果不是 JSON，直接返回字符串
      return value as T;
    }
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<boolean> {
    await this.ensureConnected();
    const prefixedKey = this.prefixKey(key);
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (ttl) {
      await this.client.setEx(prefixedKey, ttl, serialized);
    } else {
      await this.client.set(prefixedKey, serialized);
    }
    return true;
  }

  async delete(key: string): Promise<boolean> {
    await this.ensureConnected();
    const prefixedKey = this.prefixKey(key);
    const result = await this.client.del(prefixedKey);
    return result > 0;
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureConnected();
    const prefixedKey = this.prefixKey(key);
    const result = await this.client.exists(prefixedKey);
    return result > 0;
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    await this.ensureConnected();
    const prefixedKey = this.prefixKey(key);
    const result = await this.client.expire(prefixedKey, ttl);
    return result;
  }

  async ttl(key: string): Promise<number> {
    await this.ensureConnected();
    const prefixedKey = this.prefixKey(key);
    const result = await this.client.ttl(prefixedKey);
    return result;
  }

  async clear(): Promise<boolean> {
    await this.ensureConnected();
    if (this.keyPrefix) {
      // 如果有前缀，只删除带前缀的键
      const keys = await this.client.keys(`${this.keyPrefix}:*`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } else {
      // 如果没有前缀，清空当前数据库
      await this.client.flushDb();
    }
    return true;
  }

  async close(): Promise<void> {
    if (this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  /**
   * Redis 特有：批量获取（优化版）
   */
  async getMany<T = any>(keys: string[]): Promise<(T | null)[]> {
    await this.ensureConnected();
    if (keys.length === 0) return [];
    
    const prefixedKeys = keys.map(k => this.prefixKey(k));
    const values = await this.client.mGet(prefixedKeys);
    
    return values.map((value: any, _index: number) => {
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    });
  }

  /**
   * Redis 特有：批量设置（优化版）
   */
  async setMany<T = any>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<boolean> {
    await this.ensureConnected();
    if (items.length === 0) return true;

    // 使用管道（pipeline）批量设置
    const pipeline = this.client.multi();
    
    for (const item of items) {
      const prefixedKey = this.prefixKey(item.key);
      const serialized = typeof item.value === 'string' 
        ? item.value 
        : JSON.stringify(item.value);
      
      if (item.ttl) {
        pipeline.setEx(prefixedKey, item.ttl, serialized);
      } else {
        pipeline.set(prefixedKey, serialized);
      }
    }

    await pipeline.exec();
    return true;
  }

  /**
   * Redis 特有：原子递增
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    await this.ensureConnected();
    const prefixedKey = this.prefixKey(key);
    if (amount === 1) {
      return await this.client.incr(prefixedKey);
    } else {
      return await this.client.incrBy(prefixedKey, amount);
    }
  }

  /**
   * Redis 特有：原子递减
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    await this.ensureConnected();
    const prefixedKey = this.prefixKey(key);
    if (amount === 1) {
      return await this.client.decr(prefixedKey);
    } else {
      return await this.client.decrBy(prefixedKey, amount);
    }
  }
}





