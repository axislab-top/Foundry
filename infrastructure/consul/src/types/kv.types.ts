/**
 * 键值存储相关类型定义
 */

/**
 * KV 存储选项
 */
export interface KVOptions {
  /**
   * 键前缀
   */
  key: string;
  
  /**
   * 值
   */
  value?: string | Buffer | object;
  
  /**
   * 数据中心
   */
  dc?: string;
  
  /**
   * 标志
   */
  flags?: number;
  
  /**
   * 获取选项
   */
  getOptions?: KVGetOptions;
  
  /**
   * 设置选项
   */
  setOptions?: KVSetOptions;
}

/**
 * KV 获取选项
 */
export interface KVGetOptions {
  /**
   * 是否递归获取
   */
  recurse?: boolean;
  
  /**
   * 数据中心
   */
  dc?: string;
  
  /**
   * 是否返回原始值
   */
  raw?: boolean;
  
  /**
   * 键前缀
   */
  key?: string;
}

/**
 * KV 设置选项
 */
export interface KVSetOptions {
  /**
   * 标志
   */
  flags?: number;
  
  /**
   * CAS（Compare-And-Set）索引
   */
  cas?: string;
  
  /**
   * 获取并设置
   */
  acquire?: string;
  
  /**
   * 释放
   */
  release?: string;
  
  /**
   * 数据中心
   */
  dc?: string;
}

/**
 * KV 条目
 */
export interface KVEntry {
  /**
   * 创建索引
   */
  CreateIndex?: number;
  
  /**
   * 修改索引
   */
  ModifyIndex?: number;
  
  /**
   * 锁定索引
   */
  LockIndex?: number;
  
  /**
   * 标志
   */
  Flags?: number;
  
  /**
   * 键
   */
  Key?: string;
  
  /**
   * 值
   */
  Value?: string;
  
  /**
   * 会话
   */
  Session?: string;
}

/**
 * KV 监听选项
 */
export interface KVWatchOptions {
  /**
   * 键
   */
  key: string;
  
  /**
   * 是否递归监听
   */
  recurse?: boolean;
  
  /**
   * 数据中心
   */
  dc?: string;
  
  /**
   * 变更回调
   */
  onUpdate?: (entries: KVEntry[]) => void;
  
  /**
   * 错误回调
   */
  onError?: (error: Error) => void;
}






































