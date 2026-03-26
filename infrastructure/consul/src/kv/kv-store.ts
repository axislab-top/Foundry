/**
 * KV 存储实现
 */

import type { IConsulClient } from '../clients/consul-client.interface.js';
import type { KVEntry, KVGetOptions, KVSetOptions } from '../types/index.js';
import type { IKVStore } from './kv-store.interface.js';

/**
 * KV 存储实现
 */
export class KVStore implements IKVStore {
  private client: IConsulClient;
  private defaultPrefix: string;

  constructor(client: IConsulClient, defaultPrefix: string = '') {
    this.client = client;
    this.defaultPrefix = defaultPrefix;
  }

  /**
   * 规范化键名
   */
  private normalizeKey(key: string): string {
    if (this.defaultPrefix && !key.startsWith(this.defaultPrefix)) {
      return `${this.defaultPrefix}${key}`;
    }
    return key;
  }

  /**
   * 设置值
   */
  async set(key: string, value: string | Buffer | object, options?: KVSetOptions): Promise<boolean> {
    const normalizedKey = this.normalizeKey(key);
    
    const result = await this.client.setKV({
      key: normalizedKey,
      value,
      setOptions: options,
    });

    if (!result.success) {
      throw new Error(`Failed to set KV ${normalizedKey}: ${result.error}`);
    }

    return result.data || false;
  }

  /**
   * 获取值
   */
  async get(key: string, options?: Omit<KVGetOptions, 'key'>): Promise<KVEntry | null> {
    const normalizedKey = this.normalizeKey(key);
    
    const result = await this.client.getKV({
      key: normalizedKey,
      ...options,
    });

    if (!result.success) {
      throw new Error(`Failed to get KV ${normalizedKey}: ${result.error}`);
    }

    const data = result.data;
    
    if (Array.isArray(data)) {
      return data.length > 0 ? data[0] : null;
    }
    
    return data || null;
  }

  /**
   * 获取所有匹配的键
   */
  async getAll(prefix: string, options?: Omit<KVGetOptions, 'key' | 'recurse'>): Promise<KVEntry[]> {
    const normalizedPrefix = this.normalizeKey(prefix);
    
    const result = await this.client.getKV({
      key: normalizedPrefix,
      recurse: true,
      ...options,
    });

    if (!result.success) {
      throw new Error(`Failed to get KV ${normalizedPrefix}: ${result.error}`);
    }

    const data = result.data;
    
    if (Array.isArray(data)) {
      return data;
    }
    
    return data ? [data] : [];
  }

  /**
   * 删除值
   */
  async delete(key: string, options?: { recurse?: boolean; dc?: string }): Promise<boolean> {
    const normalizedKey = this.normalizeKey(key);
    
    const result = await this.client.deleteKV(normalizedKey, options);

    if (!result.success) {
      throw new Error(`Failed to delete KV ${normalizedKey}: ${result.error}`);
    }

    return result.data || false;
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<boolean> {
    try {
      const entry = await this.get(key);
      return entry !== null;
    } catch {
      return false;
    }
  }

  /**
   * 获取值的字符串形式
   */
  async getString(key: string, options?: Omit<KVGetOptions, 'key'>): Promise<string | null> {
    const entry = await this.get(key, options);
    
    if (!entry || !entry.Value) {
      return null;
    }

    return Buffer.from(entry.Value, 'base64').toString('utf8');
  }

  /**
   * 获取值的 JSON 形式
   */
  async getJSON<T = any>(key: string, options?: Omit<KVGetOptions, 'key'>): Promise<T | null> {
    const str = await this.getString(key, options);
    
    if (!str) {
      return null;
    }

    try {
      return JSON.parse(str) as T;
    } catch {
      throw new Error(`Failed to parse JSON for key ${key}`);
    }
  }

  /**
   * 设置 JSON 值
   */
  async setJSON(key: string, value: any, options?: KVSetOptions): Promise<boolean> {
    return this.set(key, JSON.stringify(value), options);
  }
}






































