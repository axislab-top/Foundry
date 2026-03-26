/**
 * 配置合并器
 */

import { ConfigObject, ConfigPriority } from '../types/index.js';

/**
 * 配置合并器
 */
export class ConfigMerger {
  /**
   * 合并多个配置对象
   * 按优先级从低到高合并，高优先级覆盖低优先级
   */
  merge(
    configs: Array<{ config: ConfigObject; priority: ConfigPriority }>,
    overwrite: boolean = true
  ): ConfigObject {
    // 按优先级排序（从低到高）
    const sorted = [...configs].sort((a, b) => a.priority - b.priority);

    let result: ConfigObject = {};

    for (const { config } of sorted) {
      result = this.mergeObject(result, config, overwrite);
    }

    return result;
  }

  /**
   * 合并两个配置对象
   */
  private mergeObject(
    target: ConfigObject,
    source: ConfigObject,
    overwrite: boolean
  ): ConfigObject {
    const result = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (overwrite || !(key in result)) {
        // 如果两个值都是对象，递归合并
        if (
          this.isPlainObject(result[key]) &&
          this.isPlainObject(value)
        ) {
          result[key] = this.mergeObject(
            result[key] as ConfigObject,
            value as ConfigObject,
            overwrite
          );
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * 检查是否为普通对象
   */
  private isPlainObject(value: any): boolean {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) === '[object Object]'
    );
  }
}







































