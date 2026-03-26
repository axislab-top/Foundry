/**
 * 环境变量配置适配器
 */

import { BaseConfigAdapter } from './config-adapter.interface.js';
import { EnvAdapterOptions, ConfigObject } from '../types/index.js';

/**
 * 环境变量适配器
 */
export class EnvAdapter extends BaseConfigAdapter {
  private options: EnvAdapterOptions;

  constructor(options: EnvAdapterOptions = {}) {
    super('env');
    this.options = {
      prefix: options.prefix,
      lowercase: options.lowercase ?? false,
      removePrefix: options.removePrefix ?? true,
    };
  }

  /**
   * 加载环境变量配置
   */
  async load(): Promise<ConfigObject> {
    const config: ConfigObject = {};
    const prefix = this.options.prefix || '';
    const prefixLength = prefix.length;

    for (const [key, value] of Object.entries(process.env)) {
      // 如果有前缀，只处理带前缀的变量
      if (prefix && !key.startsWith(prefix)) {
        continue;
      }

      // 处理键名
      let configKey = key;
      if (this.options.removePrefix && prefixLength > 0) {
        configKey = key.slice(prefixLength);
      }
      if (this.options.lowercase) {
        configKey = configKey.toLowerCase();
      }

      // 转换值类型
      config[configKey] = this.parseValue(value);
    }

    return config;
  }

  /**
   * 解析环境变量值
   * 尝试转换为数字、布尔值或 JSON
   */
  private parseValue(value: string | undefined): ConfigObject[string] {
    if (value === undefined) {
      return undefined;
    }

    // 空字符串
    if (value === '') {
      return '';
    }

    // 尝试解析为布尔值
    if (value === 'true' || value === 'TRUE') {
      return true;
    }
    if (value === 'false' || value === 'FALSE') {
      return false;
    }

    // 尝试解析为数字
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^-?\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // 尝试解析为 JSON
    if ((value.startsWith('{') && value.endsWith('}')) || 
        (value.startsWith('[') && value.endsWith(']'))) {
      try {
        return JSON.parse(value);
      } catch {
        // 解析失败，返回原始字符串
      }
    }

    // 返回原始字符串
    return value;
  }

  /**
   * 环境变量适配器始终可用
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }
}







































