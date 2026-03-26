/**
 * KV 监听器
 */

import type { IConsulClient } from '../clients/consul-client.interface.js';
import type { KVEntry, KVWatchOptions } from '../types/index.js';

/**
 * KV 监听器
 */
export class KVWatcher {
  private client: IConsulClient;
  private watchers: Map<string, NodeJS.Timeout> = new Map();
  private lastIndices: Map<string, number> = new Map();

  constructor(client: IConsulClient) {
    this.client = client;
  }

  /**
   * 监听 KV 变更
   */
  watch(options: KVWatchOptions): () => void {
    const watchKey = options.key;
    const interval = 5000; // 默认 5 秒检查一次

    // 立即执行一次
    this.checkKV(options);

    // 设置定时检查
    const timer = setInterval(() => {
      this.checkKV(options);
    }, interval);

    this.watchers.set(watchKey, timer);

    // 返回停止监听的函数
    return () => {
      this.stop(watchKey);
    };
  }

  /**
   * 检查 KV
   */
  private async checkKV(options: KVWatchOptions): Promise<void> {
    try {
      const getOptions: any = {
        key: options.key,
        recurse: options.recurse || false,
      };
      
      if (options.dc) {
        getOptions.dc = options.dc;
      }

      const result = await this.client.getKV(getOptions);

      if (!result.success) {
        if (options.onError) {
          options.onError(new Error(result.error || 'Unknown error'));
        }
        return;
      }

      const data = result.data;
      let entries: KVEntry[] = [];

      if (Array.isArray(data)) {
        entries = data;
      } else if (data) {
        entries = [data];
      }

      // 检查是否有变更（通过 ModifyIndex）
      const watchKey = options.key;
      const lastIndex = this.lastIndices.get(watchKey) || 0;
      const hasChanged = entries.some(entry => (entry.ModifyIndex || 0) > lastIndex);

      if (hasChanged) {
        const maxIndex = Math.max(...entries.map(e => e.ModifyIndex || 0), lastIndex);
        this.lastIndices.set(watchKey, maxIndex);

        if (options.onUpdate) {
          options.onUpdate(entries);
        }
      }
    } catch (error) {
      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * 停止监听
   */
  stop(key: string): void {
    const timer = this.watchers.get(key);
    if (timer) {
      clearInterval(timer);
      this.watchers.delete(key);
      this.lastIndices.delete(key);
    }
  }

  /**
   * 停止所有监听
   */
  stopAll(): void {
    for (const [key, timer] of this.watchers.entries()) {
      clearInterval(timer);
    }
    this.watchers.clear();
    this.lastIndices.clear();
  }
}






































