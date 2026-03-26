/**
 * Memcached 缓存适配器
 */

import Memcached from 'memcached';
import { BaseCacheAdapter } from './cache-adapter.interface.js';
import { MemcachedCacheOptions } from '../types/index.js';

export class MemcachedCacheAdapter extends BaseCacheAdapter {
  private client: Memcached;

  constructor(options: MemcachedCacheOptions) {
    super(options.keyPrefix || '');
    
    this.client = new Memcached(options.hosts, {
      timeout: options.timeout || 5000,
      retries: options.retries || 2,
      failures: options.failures || 5,
      retry: options.retry || 3000,
      remove: options.remove || false,
      poolSize: options.poolSize || 10,
    });

    this.client.on('failure', (details) => {
      console.error('Memcached Server Failure:', details);
    });

    this.client.on('reconnecting', (details) => {
      console.log('Memcached Reconnecting:', details);
    });
  }

  async get<T = any>(key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const prefixedKey = this.prefixKey(key);
      this.client.get(prefixedKey, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        if (data === undefined || data === null) {
          resolve(null);
          return;
        }
        // Memcached 存储的是字符串，需要解析 JSON
        try {
          resolve(JSON.parse(data as string) as T);
        } catch {
          resolve(data as T);
        }
      });
    });
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const prefixedKey = this.prefixKey(key);
      const serialized = typeof value === 'string' 
        ? value 
        : JSON.stringify(value);
      
      // Memcached TTL 单位是秒
      const lifetime = ttl || 0;
      
      this.client.set(prefixedKey, serialized, lifetime, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  async delete(key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const prefixedKey = this.prefixKey(key);
      this.client.del(prefixedKey, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      const value = await this.get(key);
      return value !== null;
    } catch {
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    // Memcached 不支持直接设置过期时间，需要获取值后重新设置
    try {
      const prefixedKey = this.prefixKey(key);
      return new Promise((resolve, reject) => {
        this.client.get(prefixedKey, (err, data) => {
          if (err || data === undefined || data === null) {
            resolve(false);
            return;
          }
          // 重新设置，使用新的 TTL
          this.client.set(prefixedKey, data, ttl, (setErr, result) => {
            if (setErr) {
              reject(setErr);
              return;
            }
            resolve(result);
          });
        });
      });
    } catch {
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    // Memcached 不支持获取 TTL
    // 返回 -1 表示无法确定
    return -1;
  }

  async clear(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.client.flush((err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(true);
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.client.end();
      resolve();
    });
  }
}





