/**
 * 配置适配器相关类型定义
 */

import { ConfigObject } from './config.types.js';

/**
 * 配置变更回调函数
 */
export type ConfigChangeCallback = (config: ConfigObject) => void | Promise<void>;

/**
 * 配置适配器接口
 */
export interface ConfigAdapter {
  /**
   * 加载配置
   */
  load(): Promise<ConfigObject>;
  
  /**
   * 监听配置变化（可选）
   */
  watch?(callback: ConfigChangeCallback): void | Promise<void>;
  
  /**
   * 停止监听配置变化（可选）
   */
  unwatch?(): void | Promise<void>;
  
  /**
   * 关闭适配器，清理资源
   */
  close?(): Promise<void>;
  
  /**
   * 获取适配器名称
   */
  getName(): string;
  
  /**
   * 检查适配器是否可用
   */
  isAvailable?(): Promise<boolean>;
}







































