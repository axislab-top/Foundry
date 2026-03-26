/**
 * Consul 配置适配器（用于 @service/config 模块集成）
 */

import { BaseConfigAdapter } from '@service/config';
import type { ConfigObject, ConfigChangeCallback } from '@service/config';
import type { ConsulAdapterOptions } from '@service/config';
import { createConsulClient } from '../clients/index.js';
import { ConsulConfigLoader } from '../config/consul-config-loader.js';
import { KVWatcher } from '../kv/kv-watcher.js';
import type { IConsulClient } from '../clients/consul-client.interface.js';

/**
 * Consul 配置适配器
 */
export class ConsulConfigAdapter extends BaseConfigAdapter {
  private options: ConsulAdapterOptions;
  private client: IConsulClient | null = null;
  private configLoader: ConsulConfigLoader | null = null;
  private kvWatcher: KVWatcher | null = null;
  private stopWatch: (() => void) | null = null;

  constructor(options: ConsulAdapterOptions) {
    super('consul');
    this.options = {
      host: options.host || 'localhost',
      port: options.port || 8500,
      secure: options.secure || false,
      token: options.token,
      datacenter: options.datacenter,
      prefix: options.prefix || 'config/',
    };
  }

  /**
   * 初始化客户端
   */
  private async initializeClient(): Promise<void> {
    if (this.client) {
      return;
    }

    this.client = createConsulClient({
      host: this.options.host,
      port: this.options.port,
      secure: this.options.secure,
      token: this.options.token,
      datacenter: this.options.datacenter,
      defaultKeyPrefix: this.options.prefix,
    });

    await this.client.connect();
    this.configLoader = new ConsulConfigLoader(this.client, this.options.prefix);
    this.kvWatcher = new KVWatcher(this.client);
  }

  /**
   * 加载配置
   */
  async load(): Promise<ConfigObject> {
    await this.initializeClient();
    
    if (!this.configLoader) {
      throw new Error('Config loader not initialized');
    }

    return this.configLoader.loadConfig();
  }

  /**
   * 监听配置变化
   */
  async watch(callback: ConfigChangeCallback): Promise<void> {
    await this.initializeClient();
    
    if (!this.configLoader || !this.kvWatcher) {
      throw new Error('Config loader or watcher not initialized');
    }

    // 添加回调
    this.callbacks.add(callback);

    // 如果已经在监听，不需要重复设置
    if (this.watching) {
      return;
    }

    this.watching = true;

    // 开始监听配置前缀下的所有键
    this.stopWatch = this.kvWatcher.watch({
      key: this.options.prefix || 'config/',
      recurse: true,
      onUpdate: async (entries) => {
        // 清除缓存并重新加载配置
        this.configLoader!.clearCache();
        const newConfig = await this.configLoader!.loadConfig();
        await this.notifyChange(newConfig);
      },
      onError: (error) => {
        console.error(`Consul config watch error: ${error.message}`);
      },
    });
  }

  /**
   * 停止监听配置变化
   */
  async unwatch(): Promise<void> {
    if (this.stopWatch) {
      this.stopWatch();
      this.stopWatch = null;
    }

    if (this.kvWatcher) {
      this.kvWatcher.stopAll();
    }

    this.callbacks.clear();
    this.watching = false;
  }

  /**
   * 关闭适配器
   */
  async close(): Promise<void> {
    await this.unwatch();

    if (this.client) {
      await this.client.disconnect();
      this.client = null;
      this.configLoader = null;
      this.kvWatcher = null;
    }
  }

  /**
   * 检查适配器是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.initializeClient();
      
      if (!this.client) {
        return false;
      }

      // 尝试获取一个测试键来验证连接（不存在也视为成功，只要无连接错误）
      await this.client.getKV({ key: 'test', raw: true });
      return true;
    } catch {
      return false;
    }
  }
}









