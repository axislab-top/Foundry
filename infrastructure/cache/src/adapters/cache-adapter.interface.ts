/**
 * 缓存适配器接口
 * 
 * 所有缓存适配器必须实现此接口
 */

import { CacheAdapter } from '../types/index.js';

/**
 * 抽象缓存适配器基类
 * 提供一些通用方法的默认实现
 */
export abstract class BaseCacheAdapter implements CacheAdapter {
  protected keyPrefix: string;

  constructor(keyPrefix: string = '') {
    this.keyPrefix = keyPrefix;
  }

  /**
   * 添加键前缀
   */
  protected prefixKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  /**
   * 移除键前缀（用于返回结果）
   */
  protected unprefixKey(key: string): string {
    if (!this.keyPrefix) return key;
    const prefix = `${this.keyPrefix}:`;
    return key.startsWith(prefix) ? key.slice(prefix.length) : key;
  }

  // 抽象方法，子类必须实现
  abstract get<T = any>(key: string): Promise<T | null>;
  abstract set<T = any>(key: string, value: T, ttl?: number): Promise<boolean>;
  abstract delete(key: string): Promise<boolean>;
  abstract exists(key: string): Promise<boolean>;
  abstract expire(key: string, ttl: number): Promise<boolean>;
  abstract ttl(key: string): Promise<number>;
  abstract clear(): Promise<boolean>;
  abstract close(): Promise<void>;

  /**
   * 批量删除（默认实现）
   */
  async deleteMany(keys: string[]): Promise<number> {
    const results = await Promise.all(
      keys.map(key => this.delete(key))
    );
    return results.filter(Boolean).length;
  }

  /**
   * 获取多个键的值（默认实现）
   */
  async getMany<T = any>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)));
  }

  /**
   * 设置多个键值对（默认实现）
   */
  async setMany<T = any>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<boolean> {
    const results = await Promise.all(
      items.map(item => this.set(item.key, item.value, item.ttl))
    );
    return results.every(Boolean);
  }

  /**
   * 递增（默认实现）
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    const current = await this.get<number>(key);
    const newValue = (current || 0) + amount;
    await this.set(key, newValue);
    return newValue;
  }

  /**
   * 递减（默认实现）
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    return this.increment(key, -amount);
  }
}





