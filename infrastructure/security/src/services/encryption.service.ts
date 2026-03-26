/**
 * 加密服务
 */

import { EncryptionManager } from '../infrastructure/encryption-manager.js';
import type {
  EncryptionAdapterType,
  EncryptionOptions,
  EncryptionResult,
  DecryptionOptions,
} from '../types/encryption.types.js';

export class EncryptionService {
  private encryptionManager: EncryptionManager;

  constructor(encryptionManager: EncryptionManager) {
    this.encryptionManager = encryptionManager;
  }

  /**
   * 加密数据
   */
  async encrypt(
    data: string | Buffer,
    options?: EncryptionOptions,
    adapter?: EncryptionAdapterType,
  ): Promise<EncryptionResult> {
    return this.encryptionManager.encrypt(data, options, adapter);
  }

  /**
   * 解密数据
   */
  async decrypt(
    encrypted: string | Buffer,
    options?: DecryptionOptions,
    adapter?: EncryptionAdapterType,
  ): Promise<string | Buffer> {
    return this.encryptionManager.decrypt(encrypted, options, adapter);
  }

  /**
   * 加密字符串并返回 base64
   */
  async encryptToBase64(
    data: string,
    options?: EncryptionOptions,
    adapter?: EncryptionAdapterType,
  ): Promise<string> {
    const result = await this.encrypt(data, options, adapter);
    const encrypted = Buffer.isBuffer(result.encrypted)
      ? result.encrypted
      : Buffer.from(result.encrypted);
    return encrypted.toString('base64');
  }

  /**
   * 从 base64 解密字符串
   */
  async decryptFromBase64(
    encryptedBase64: string,
    options?: DecryptionOptions,
    adapter?: EncryptionAdapterType,
  ): Promise<string> {
    const encrypted = Buffer.from(encryptedBase64, 'base64');
    const decrypted = await this.decrypt(encrypted, options, adapter);
    return Buffer.isBuffer(decrypted) ? decrypted.toString('utf8') : decrypted;
  }
}






































