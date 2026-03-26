/**
 * 哈希管理器
 */

import type { HashingAdapter } from '../adapters/hashing/hashing-adapter.interface.js';
import { BcryptAdapter } from '../adapters/hashing/bcrypt-adapter.js';
import { Argon2Adapter } from '../adapters/hashing/argon2-adapter.js';
import {
  HashingAdapterType,
  HashingAdapterConfig,
  HashingOptions,
} from '../types/hashing.types.js';

export interface HashingManagerConfig {
  defaultAdapter: HashingAdapterType;
  adapters: Array<{
    adapter: HashingAdapterType;
    options: HashingAdapterConfig;
  }>;
}

export class HashingManager {
  private static instance: HashingManager | null = null;
  private adapters: Map<HashingAdapterType, HashingAdapter> = new Map();
  private defaultAdapter: HashingAdapterType;

  private constructor(config: HashingManagerConfig) {
    this.defaultAdapter = config.defaultAdapter;

    for (const { adapter, options } of config.adapters) {
      let hashingAdapter: HashingAdapter;

      switch (adapter) {
        case HashingAdapterType.BCRYPT:
          hashingAdapter = new BcryptAdapter(options);
          break;
        case HashingAdapterType.ARGON2:
          hashingAdapter = new Argon2Adapter(options);
          break;
        default:
          throw new Error(`Unsupported hashing adapter: ${adapter}`);
      }

      this.adapters.set(adapter, hashingAdapter);
    }
  }

  static create(config: HashingManagerConfig): HashingManager {
    if (!HashingManager.instance) {
      HashingManager.instance = new HashingManager(config);
    }
    return HashingManager.instance;
  }

  static getInstance(): HashingManager {
    if (!HashingManager.instance) {
      throw new Error('HashingManager not initialized. Call create() first.');
    }
    return HashingManager.instance;
  }

  static reset(): void {
    HashingManager.instance = null;
  }

  /**
   * 哈希数据
   */
  async hash(
    data: string,
    options?: HashingOptions,
    adapter?: HashingAdapterType,
  ): Promise<string> {
    const hashingAdapter = this.getAdapter(adapter);
    return hashingAdapter.hash(data, options);
  }

  /**
   * 验证数据与哈希是否匹配
   */
  async verify(
    data: string,
    hash: string,
    adapter?: HashingAdapterType,
  ): Promise<boolean> {
    const hashingAdapter = this.getAdapter(adapter);
    return hashingAdapter.verify(data, hash);
  }

  private getAdapter(adapter?: HashingAdapterType): HashingAdapter {
    const adapterType = adapter || this.defaultAdapter;
    const hashingAdapter = this.adapters.get(adapterType);

    if (!hashingAdapter) {
      throw new Error(`Hashing adapter not found: ${adapterType}`);
    }

    return hashingAdapter;
  }
}









