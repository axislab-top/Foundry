/**
 * Consul 配置加载器
 */

import type { IConsulClient } from '../clients/consul-client.interface.js';
import { KVStore } from '../kv/kv-store.js';
import type { KVEntry } from '../types/index.js';

/**
 * 配置对象类型
 */
export type ConfigObject = Record<string, any>;

/**
 * Consul 配置加载器
 */
export class ConsulConfigLoader {
  private kvStore: KVStore;
  private configCache: Map<string, any> = new Map();

  constructor(client: IConsulClient, prefix: string = 'config/') {
    this.kvStore = new KVStore(client, prefix);
  }

  /**
   * 加载配置
   */
  async loadConfig(key?: string): Promise<ConfigObject> {
    if (key) {
      // 加载单个配置键
      const value = await this.kvStore.getJSON(key);
      return value || {};
    } else {
      // 加载所有配置
      const entries = await this.kvStore.getAll('');
      const config: ConfigObject = {};

      for (const entry of entries) {
        if (entry.Key && entry.Value) {
          const key = entry.Key.replace(this.kvStore['defaultPrefix'], '');
          const value = Buffer.from(entry.Value, 'base64').toString('utf8');
          
          try {
            const parsed = JSON.parse(value);
            this.setNestedValue(config, key, parsed);
          } catch {
            // 如果不是 JSON，直接使用字符串值
            this.setNestedValue(config, key, value);
          }
        }
      }

      return config;
    }
  }

  /**
   * 设置嵌套值
   */
  private setNestedValue(obj: ConfigObject, path: string, value: any): void {
    const keys = path.split('/').filter(k => k);
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    current[lastKey] = value;
  }

  /**
   * 获取配置值
   */
  async getConfig(key: string): Promise<any> {
    // 检查缓存
    if (this.configCache.has(key)) {
      return this.configCache.get(key);
    }

    const value = await this.kvStore.getJSON(key);
    
    if (value !== null) {
      this.configCache.set(key, value);
    }

    return value;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * 清除特定键的缓存
   */
  clearCacheKey(key: string): void {
    this.configCache.delete(key);
  }
}






































