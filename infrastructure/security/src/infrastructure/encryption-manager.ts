/**
 * 加密管理器
 */

import type { EncryptionAdapter } from '../adapters/encryption/encryption-adapter.interface.js';
import { AesAdapter } from '../adapters/encryption/aes-adapter.js';
import { RsaAdapter } from '../adapters/encryption/rsa-adapter.js';
import {
  EncryptionAdapterType,
  EncryptionAdapterConfig,
  EncryptionOptions,
  EncryptionResult,
  DecryptionOptions,
} from '../types/encryption.types.js';

export interface EncryptionManagerConfig {
  defaultAdapter: EncryptionAdapterType;
  adapters: Array<{
    adapter: EncryptionAdapterType;
    options: EncryptionAdapterConfig;
  }>;
}

export class EncryptionManager {
  private static instance: EncryptionManager | null = null;
  private adapters: Map<EncryptionAdapterType, EncryptionAdapter> = new Map();
  private defaultAdapter: EncryptionAdapterType;

  private constructor(config: EncryptionManagerConfig) {
    this.defaultAdapter = config.defaultAdapter;

    for (const { adapter, options } of config.adapters) {
      let encryptionAdapter: EncryptionAdapter;

      switch (adapter) {
        case EncryptionAdapterType.AES:
          encryptionAdapter = new AesAdapter(options);
          break;
        case EncryptionAdapterType.RSA:
          encryptionAdapter = new RsaAdapter(options);
          break;
        default:
          throw new Error(`Unsupported encryption adapter: ${adapter}`);
      }

      this.adapters.set(adapter, encryptionAdapter);
    }
  }

  static create(config: EncryptionManagerConfig): EncryptionManager {
    if (!EncryptionManager.instance) {
      EncryptionManager.instance = new EncryptionManager(config);
    }
    return EncryptionManager.instance;
  }

  static getInstance(): EncryptionManager {
    if (!EncryptionManager.instance) {
      throw new Error('EncryptionManager not initialized. Call create() first.');
    }
    return EncryptionManager.instance;
  }

  static reset(): void {
    EncryptionManager.instance = null;
  }

  /**
   * 加密数据
   */
  async encrypt(
    data: string | Buffer,
    options?: EncryptionOptions,
    adapter?: EncryptionAdapterType,
  ): Promise<EncryptionResult> {
    const encryptionAdapter = this.getAdapter(adapter);
    return encryptionAdapter.encrypt(data, options);
  }

  /**
   * 解密数据
   */
  async decrypt(
    encrypted: string | Buffer,
    options?: DecryptionOptions,
    adapter?: EncryptionAdapterType,
  ): Promise<string | Buffer> {
    const encryptionAdapter = this.getAdapter(adapter);
    return encryptionAdapter.decrypt(encrypted, options);
  }

  private getAdapter(adapter?: EncryptionAdapterType): EncryptionAdapter {
    const adapterType = adapter || this.defaultAdapter;
    const encryptionAdapter = this.adapters.get(adapterType);

    if (!encryptionAdapter) {
      throw new Error(`Encryption adapter not found: ${adapterType}`);
    }

    return encryptionAdapter;
  }
}









