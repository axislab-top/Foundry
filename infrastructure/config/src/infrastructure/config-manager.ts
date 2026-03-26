/**
 * 配置管理器
 * 提供统一的配置访问接口，支持多源配置合并和验证
 */

import {
  ConfigManagerConfig,
  ConfigAdapterConfig,
  ConfigObject,
  ConfigValue,
  ConfigPriority,
  ConfigAdapterType,
} from '../types/index.js';
import { ConfigLoader } from './config-loader.js';
import { ConfigMerger } from './config-merger.js';
import { ConfigValidator, ValidationResult } from '../validators/index.js';
import { JoiValidator } from '../validators/joi-validator.js';

/**
 * 配置管理器
 */
export class ConfigManager {
  private static instance: ConfigManager | null = null;
  private config: ConfigObject = {};
  private loader: ConfigLoader;
  private merger: ConfigMerger;
  private validator: ConfigValidator | null = null;
  private validationSchema: any = null;

  private constructor(config: ConfigManagerConfig = {}) {
    this.loader = new ConfigLoader();
    this.merger = new ConfigMerger();

    // 设置验证器
    if (config.validationSchema) {
      this.validator = new JoiValidator();
      this.validationSchema = config.validationSchema;
    }
  }

  /**
   * 创建配置管理器实例（单例模式）
   */
  static async create(
    config: ConfigManagerConfig = {}
  ): Promise<ConfigManager> {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(config);
      await ConfigManager.instance.initialize(config);
    }
    return ConfigManager.instance;
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      throw new Error(
        'ConfigManager not initialized. Call ConfigManager.create() first.'
      );
    }
    return ConfigManager.instance;
  }

  /**
   * 重置单例（主要用于测试）
   */
  static reset(): void {
    if (ConfigManager.instance) {
      ConfigManager.instance.close();
      ConfigManager.instance = null;
    }
  }

  /**
   * 初始化配置管理器
   */
  private async initialize(config: ConfigManagerConfig): Promise<void> {
    // 加载配置
    const adapterConfigs = config.adapters || this.getDefaultAdapters();
    const loadedConfigs = await this.loader.loadConfigs(adapterConfigs);

    // 合并配置
    this.config = this.merger.merge(loadedConfigs, config.overwriteOnMerge ?? true);

    // 验证配置
    if (this.validator && this.validationSchema) {
      const result = this.validator.validate(this.config, this.validationSchema);
      if (!result.valid) {
        throw new Error(
          `Configuration validation failed: ${result.error}\n${result.details?.map(d => `  - ${d.path}: ${d.message}`).join('\n')}`
        );
      }
      if (result.value) {
        this.config = result.value;
      }
    }
  }

  /**
   * 获取默认适配器配置
   */
  private getDefaultAdapters(): ConfigAdapterConfig[] {
    return [
      {
        type: ConfigAdapterType.ENV,
        priority: ConfigPriority.ENV,
        enabled: true,
      },
    ];
  }

  /**
   * 获取配置值
   */
  get<T = ConfigValue>(key: string, defaultValue?: T): T {
    const keys = key.split('.');
    let value: any = this.config;

    for (const k of keys) {
      if (value === null || value === undefined) {
        return defaultValue as T;
      }
      value = value[k];
    }

    return (value !== undefined ? value : defaultValue) as T;
  }

  /**
   * 检查配置键是否存在
   */
  has(key: string): boolean {
    const keys = key.split('.');
    let value: any = this.config;

    for (const k of keys) {
      if (value === null || value === undefined || typeof value !== 'object') {
        return false;
      }
      value = value[k];
    }

    return value !== undefined;
  }

  /**
   * 获取所有配置
   */
  getAll(): ConfigObject {
    return { ...this.config };
  }

  /**
   * 设置配置值（运行时修改）
   */
  set(key: string, value: ConfigValue): void {
    const keys = key.split('.');
    const lastKey = keys.pop()!;
    let target: any = this.config;

    for (const k of keys) {
      if (target[k] === null || target[k] === undefined || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }

    target[lastKey] = value;
  }

  /**
   * 验证配置
   */
  validate(schema: any): ValidationResult {
    if (!this.validator) {
      this.validator = new JoiValidator();
    }
    return this.validator.validate(this.config, schema);
  }

  /**
   * 重新加载配置
   */
  async reload(config?: ConfigManagerConfig): Promise<void> {
    await this.close();
    if (config) {
      this.validationSchema = config.validationSchema || this.validationSchema;
      if (config.validationSchema && !this.validator) {
        this.validator = new JoiValidator();
      }
    }
    await this.initialize(config || {});
  }

  /**
   * 关闭配置管理器，清理资源
   */
  async close(): Promise<void> {
    await this.loader.closeAll();
    this.config = {};
  }
}
























