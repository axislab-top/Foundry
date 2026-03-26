/**
 * RSA 加密适配器
 */

import { publicEncrypt, privateDecrypt, constants } from 'crypto';
import type { EncryptionAdapter } from './encryption-adapter.interface.js';
import type {
  EncryptionAdapterConfig,
  EncryptionOptions,
  EncryptionResult,
  DecryptionOptions,
} from '../../types/encryption.types.js';

export class RsaAdapter implements EncryptionAdapter {
  private config: EncryptionAdapterConfig;
  private publicKey: string;
  private privateKey: string;

  constructor(config: EncryptionAdapterConfig) {
    this.config = config;

    if (!config.publicKey || !config.privateKey) {
      throw new Error('RSA adapter requires both publicKey and privateKey');
    }

    this.publicKey = config.publicKey;
    this.privateKey = config.privateKey;
  }

  async encrypt(
    data: string | Buffer,
    options?: EncryptionOptions,
  ): Promise<EncryptionResult> {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

    // RSA 有大小限制，需要分块加密
    const maxChunkSize = 245; // 对于 2048 位密钥
    const chunks: Buffer[] = [];

    for (let i = 0; i < dataBuffer.length; i += maxChunkSize) {
      const chunk = dataBuffer.slice(i, i + maxChunkSize);
      const encrypted = publicEncrypt(
        {
          key: this.publicKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
        },
        chunk,
      );
      chunks.push(encrypted);
    }

    const encrypted = Buffer.concat(chunks);

    return {
      encrypted,
    };
  }

  async decrypt(
    encrypted: string | Buffer,
    options?: DecryptionOptions,
  ): Promise<string | Buffer> {
    const encryptedBuffer = Buffer.isBuffer(encrypted)
      ? encrypted
      : Buffer.from(encrypted, 'base64');

    // 分块解密
    const chunkSize = 256; // RSA 2048 位密钥的加密块大小
    const chunks: Buffer[] = [];

    for (let i = 0; i < encryptedBuffer.length; i += chunkSize) {
      const chunk = encryptedBuffer.slice(i, i + chunkSize);
      const decrypted = privateDecrypt(
        {
          key: this.privateKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
        },
        chunk,
      );
      chunks.push(decrypted);
    }

    return Buffer.concat(chunks);
  }
}






































