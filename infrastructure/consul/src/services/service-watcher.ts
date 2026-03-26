/**
 * 服务监听器
 */

import type { IConsulClient } from '../clients/consul-client.interface.js';
import type { ServiceInstance, ServiceWatchOptions } from '../types/index.js';

/**
 * 服务监听器
 */
export class ServiceWatcher {
  private client: IConsulClient;
  private watchers: Map<string, NodeJS.Timeout> = new Map();
  private lastResults: Map<string, ServiceInstance[]> = new Map();

  constructor(client: IConsulClient) {
    this.client = client;
  }

  /**
   * 监听服务变更
   */
  watch(options: ServiceWatchOptions): () => void {
    const watchKey = this.getWatchKey(options);
    const interval = options.interval || 5000;

    // 立即执行一次
    this.checkService(options);

    // 设置定时检查
    const timer = setInterval(() => {
      this.checkService(options);
    }, interval);

    this.watchers.set(watchKey, timer);

    // 返回停止监听的函数
    return () => {
      this.stop(watchKey);
    };
  }

  /**
   * 检查服务
   */
  private async checkService(options: ServiceWatchOptions): Promise<void> {
    try {
      const result = await this.client.queryService({
        service: options.service,
        tag: options.tag,
        passing: options.passing !== false,
        dc: options.dc,
        near: options.near,
      });

      if (!result.success) {
        if (options.onError) {
          options.onError(new Error(result.error || 'Unknown error'));
        }
        return;
      }

      const instances = result.data || [];
      const watchKey = this.getWatchKey(options);
      const lastInstances = this.lastResults.get(watchKey) || [];

      // 检查是否有变更
      if (this.hasChanged(lastInstances, instances)) {
        this.lastResults.set(watchKey, instances);
        
        if (options.onUpdate) {
          options.onUpdate(instances);
        }
      }
    } catch (error) {
      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * 检查服务实例是否有变更
   */
  private hasChanged(oldInstances: ServiceInstance[], newInstances: ServiceInstance[]): boolean {
    if (oldInstances.length !== newInstances.length) {
      return true;
    }

    const oldIds = new Set(oldInstances.map(i => i.id));
    const newIds = new Set(newInstances.map(i => i.id));

    if (oldIds.size !== newIds.size) {
      return true;
    }

    for (const id of oldIds) {
      if (!newIds.has(id)) {
        return true;
      }
    }

    // 检查健康状态变更
    for (const newInstance of newInstances) {
      const oldInstance = oldInstances.find(i => i.id === newInstance.id);
      if (oldInstance && oldInstance.healthy !== newInstance.healthy) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取监听键
   */
  private getWatchKey(options: ServiceWatchOptions): string {
    return `${options.service}:${options.tag || ''}:${options.dc || ''}`;
  }

  /**
   * 停止监听
   */
  stop(watchKey: string): void {
    const timer = this.watchers.get(watchKey);
    if (timer) {
      clearInterval(timer);
      this.watchers.delete(watchKey);
      this.lastResults.delete(watchKey);
    }
  }

  /**
   * 停止所有监听
   */
  stopAll(): void {
    for (const [watchKey, timer] of this.watchers.entries()) {
      clearInterval(timer);
    }
    this.watchers.clear();
    this.lastResults.clear();
  }
}






































