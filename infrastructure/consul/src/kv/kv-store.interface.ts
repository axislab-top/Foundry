/**
 * KV 存储接口
 */

import type { KVEntry } from '../types/index.js';

/**
 * KV 存储接口
 */
export interface IKVStore {
  /**
   * 设置值
   */
  set(key: string, value: string | Buffer | object, options?: any): Promise<boolean>;
  
  /**
   * 获取值
   */
  get(key: string, options?: any): Promise<KVEntry | null>;
  
  /**
   * 获取所有匹配的键
   */
  getAll(prefix: string, options?: any): Promise<KVEntry[]>;
  
  /**
   * 删除值
   */
  delete(key: string, options?: any): Promise<boolean>;
  
  /**
   * 检查键是否存在
   */
  exists(key: string): Promise<boolean>;
}






































