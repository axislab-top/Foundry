/**
 * AES 加密适配器
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  CipherGCM,
  DecipherGCM,
} from 'crypto';
import type { EncryptionAdapter } from './encryption-adapter.interface.js';
import type {
  EncryptionAdapterConfig,
  EncryptionOptions,
  EncryptionResult,
  DecryptionOptions,
} from '../../types/encryption.types.js';

export class AesAdapter implements EncryptionAdapter {
  private config: EncryptionAdapterConfig;
  private algorithm: string;
  private key: Buffer;

  constructor(config: EncryptionAdapterConfig) {
    this.config = {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ...config,
    };

    this.algorithm = this.config.algorithm || 'aes-256-gcm';
    this.key = this.deriveKey(config.key);
  }

  async encrypt(
    data: string | Buffer,
    options?: EncryptionOptions,
  ): Promise<EncryptionResult> {
    const algorithm = options?.algorithm || this.algorithm;
    const iv = options?.iv || randomBytes(16);

    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

    if (algorithm.includes('gcm')) {
      const cipher = createCipheriv(algorithm, this.key, iv) as CipherGCM;
      const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
      const tag = cipher.getAuthTag();

      return {
        encrypted,
        iv,
        tag,
      };
    } else {
      const cipher = createCipheriv(algorithm, this.key, iv);
      const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);

      return {
        encrypted,
        iv,
      };
    }
  }

  async decrypt(
    encrypted: string | Buffer,
    options?: DecryptionOptions,
  ): Promise<string | Buffer> {
    const algorithm = this.algorithm;
    const encryptedBuffer = Buffer.isBuffer(encrypted)
      ? encrypted
      : Buffer.from(encrypted, 'base64');

    if (!options?.iv) {
      throw new Error('IV is required for decryption');
    }

    if (algorithm.includes('gcm')) {
      if (!options?.tag) {
        throw new Error('Tag is required for GCM decryption');
      }

      const decipher = createDecipheriv(algorithm, this.key, options.iv) as DecipherGCM;
      decipher.setAuthTag(options.tag);
      const decrypted = Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final(),
      ]);

      return decrypted;
    } else {
      const decipher = createDecipheriv(algorithm, this.key, options.iv);
      const decrypted = Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final(),
      ]);

      return decrypted;
    }
  }

  private deriveKey(key?: string | Buffer): Buffer {
    if (!key) {
      throw new Error('Encryption key is required for AES adapter');
    }

    if (Buffer.isBuffer(key)) {
      if (key.length === 32) {
        return key;
      }
      return createHash('sha256').update(key).digest();
    }

    // 从字符串派生密钥
    return createHash('sha256').update(key).digest();
  }
}









