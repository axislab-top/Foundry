/**
 * 配置加载器
 */

import {
  ConfigAdapter,
  ConfigAdapterType,
  ConfigAdapterConfig,
  ConfigObject,
  ConfigPriority,
} from '../types/index.js';
import { EnvAdapter } from '../adapters/env-adapter.js';
import { FileAdapter } from '../adapters/file-adapter.js';
import {
  EnvAdapterOptions,
  FileAdapterOptions,
  ConsulAdapterOptions,
} from '../types/index.js';

/**
 * 配置加载器
 */
export class ConfigLoader {
  private adapters: Map<ConfigAdapterType, ConfigAdapter> = new Map();

  /**
   * 创建适配器实例
   */
  async createAdapter(config: ConfigAdapterConfig): Promise<ConfigAdapter> {
    switch (config.type) {
      case ConfigAdapterType.ENV:
        return new EnvAdapter(config.options as EnvAdapterOptions);

      case ConfigAdapterType.FILE:
        if (!config.options || !('path' in config.options)) {
          throw new Error('File adapter requires path option');
        }
        return new FileAdapter(config.options as FileAdapterOptions);

      case ConfigAdapterType.CONSUL:
        // 动态导入 Consul 适配器（可选依赖）
        try {
          // @ts-expect-error - @service/consul is an optional runtime dependency
          const { ConsulConfigAdapter } = await import('@service/consul');
          if (!config.options || !('host' in config.options)) {
            throw new Error('Consul adapter requires host option');
          }
          return new ConsulConfigAdapter(config.options as ConsulAdapterOptions) as unknown as ConfigAdapter;
        } catch (error: any) {
          if (error.code === 'MODULE_NOT_FOUND') {
            throw new Error(
              'Consul adapter requires @service/consul package. Please install it: pnpm add @service/consul'
            );
          }
          throw error;
        }

      case ConfigAdapterType.VAULT:
        throw new Error('Vault adapter not yet implemented');

      default:
        throw new Error(`Unsupported adapter type: ${config.type}`);
    }
  }

  /**
   * 加载配置
   */
  async loadConfigs(
    adapterConfigs: ConfigAdapterConfig[]
  ): Promise<Array<{ config: ConfigObject; priority: ConfigPriority }>> {
    const results: Array<{
      config: ConfigObject;
      priority: ConfigPriority;
    }> = [];

    for (const adapterConfig of adapterConfigs) {
      // 跳过禁用的适配器
      if (adapterConfig.enabled === false) {
        continue;
      }

      try {
        // 创建适配器
        const adapter = await this.createAdapter(adapterConfig);

        // 检查适配器是否可用
        if (adapter.isAvailable) {
          const available = await adapter.isAvailable();
          if (!available) {
            console.warn(
              `Adapter ${adapterConfig.type} is not available, skipping...`
            );
            continue;
          }
        }

        // 加载配置
        const config = await adapter.load();
        const priority =
          adapterConfig.priority ?? this.getDefaultPriority(adapterConfig.type);

        results.push({ config, priority });

        // 缓存适配器（用于后续的 watch）
        this.adapters.set(adapterConfig.type, adapter);
      } catch (error: any) {
        console.error(
          `Failed to load config from adapter ${adapterConfig.type}: ${error.message}`
        );
        // 继续加载其他适配器
      }
    }

    return results;
  }

  /**
   * 获取默认优先级
   */
  private getDefaultPriority(type: ConfigAdapterType): ConfigPriority {
    switch (type) {
      case ConfigAdapterType.ENV:
        return ConfigPriority.ENV;
      case ConfigAdapterType.FILE:
        return ConfigPriority.FILE;
      case ConfigAdapterType.CONSUL:
      case ConfigAdapterType.VAULT:
        return ConfigPriority.REMOTE;
      default:
        return ConfigPriority.DEFAULT;
    }
  }

  /**
   * 关闭所有适配器
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.adapters.values()).map(
      async (adapter) => {
        if (adapter.close) {
          await adapter.close();
        }
      }
    );
    await Promise.all(closePromises);
    this.adapters.clear();
  }
}



