/**
 * 内存缓存适配器
 * 
 * 适用于单进程应用或开发环境
 */

import { BaseCacheAdapter } from './cache-adapter.interface.js';
import { MemoryCacheOptions } from '../types/index.js';

interface CacheEntry<T = any> {
  value: T;
  expiresAt: number | null;
}

export class MemoryCacheAdapter extends BaseCacheAdapter {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private defaultTtl: number;
  private checkInterval: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: MemoryCacheOptions = {}) {
    super(options.keyPrefix || '');
    this.maxSize = options.maxSize || 1000;
    this.defaultTtl = options.ttl || 0; // 0 表示永不过期
    this.checkInterval = options.checkInterval || 60; // 默认 60 秒清理一次

    // 启动定期清理过期条目
    this.startCleanup();
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    if (this.checkInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.checkInterval * 1000);
    }
  }

  /**
   * 清理过期条目
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt !== null && entry.expiresAt < now) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * 检查并清理（如果超过最大大小）
   */
  private checkSize(): void {
    if (this.cache.size >= this.maxSize) {
      // 使用 LRU 策略：删除最老的条目
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    const prefixedKey = this.prefixKey(key);
    const entry = this.cache.get(prefixedKey);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.cache.delete(prefixedKey);
      return null;
    }

    // 返回值的深拷贝
    return this.deepClone(entry.value) as T;
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    const actualTtl = ttl !== undefined ? ttl : this.defaultTtl;
    
    const expiresAt = actualTtl > 0 
      ? Date.now() + actualTtl * 1000 
      : null;

    // 检查大小
    if (!this.cache.has(prefixedKey)) {
      this.checkSize();
    }

    // 存储值的深拷贝
    this.cache.set(prefixedKey, {
      value: this.deepClone(value),
      expiresAt
    });

    return true;
  }

  async delete(key: string): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    return this.cache.delete(prefixedKey);
  }

  async exists(key: string): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    const entry = this.cache.get(prefixedKey);
    
    if (!entry) {
      return false;
    }

    // 检查是否过期
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.cache.delete(prefixedKey);
      return false;
    }

    return true;
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    const entry = this.cache.get(prefixedKey);
    
    if (!entry) {
      return false;
    }

    entry.expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : null;
    return true;
  }

  async ttl(key: string): Promise<number> {
    const prefixedKey = this.prefixKey(key);
    const entry = this.cache.get(prefixedKey);
    
    if (!entry) {
      return -2; // 键不存在
    }

    if (entry.expiresAt === null) {
      return -1; // 永不过期
    }

    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async clear(): Promise<boolean> {
    if (this.keyPrefix) {
      // 如果有前缀，只删除带前缀的键
      const keysToDelete: string[] = [];
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${this.keyPrefix}:`)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.cache.delete(key);
      }
    } else {
      // 如果没有前缀，清空所有
      this.cache.clear();
    }
    return true;
  }

  async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
  }

  /**
   * 深拷贝辅助方法
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    return JSON.parse(JSON.stringify(obj)) as T;
  }
}





