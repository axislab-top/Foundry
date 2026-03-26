/**
 * 配置适配器接口和基类
 */

import { ConfigAdapter, ConfigChangeCallback } from '../types/index.js';
import { ConfigObject } from '../types/index.js';

/**
 * 抽象配置适配器基类
 * 提供一些通用方法的默认实现
 */
export abstract class BaseConfigAdapter implements ConfigAdapter {
  protected name: string;
  protected watching: boolean = false;
  protected callbacks: Set<ConfigChangeCallback> = new Set();

  constructor(name: string) {
    this.name = name;
  }

  /**
   * 获取适配器名称
   */
  getName(): string {
    return this.name;
  }

  /**
   * 加载配置（抽象方法，子类必须实现）
   */
  abstract load(): Promise<ConfigObject>;

  /**
   * 监听配置变化（可选实现）
   */
  watch?(callback: ConfigChangeCallback): void | Promise<void> {
    this.callbacks.add(callback);
    this.watching = true;
  }

  /**
   * 停止监听配置变化（可选实现）
   */
  unwatch?(): void | Promise<void> {
    this.callbacks.clear();
    this.watching = false;
  }

  /**
   * 通知所有监听器配置已变更
   */
  protected async notifyChange(config: ConfigObject): Promise<void> {
    const promises = Array.from(this.callbacks).map(callback => {
      try {
        const result = callback(config);
        return result instanceof Promise ? result : Promise.resolve();
      } catch (error) {
        console.error(`Error in config change callback: ${error}`);
        return Promise.resolve();
      }
    });
    await Promise.all(promises);
  }

  /**
   * 关闭适配器，清理资源（可选实现）
   */
  async close(): Promise<void> {
    if (this.unwatch) {
      await this.unwatch();
    }
  }

  /**
   * 检查适配器是否可用（可选实现）
   */
  async isAvailable?(): Promise<boolean> {
    return true;
  }
}
























