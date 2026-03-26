import { Injectable, Logger } from '@nestjs/common';
import { EncryptionManager } from '@service/security';
import { SecurityService } from './security.service.js';

/**
 * 加密服务
 * 提供数据加密和解密功能
 * 注意：如果未配置加密密钥（AES_KEY 或 RSA_PUBLIC_KEY），加密功能将不可用
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private encryptionManager?: EncryptionManager;

  constructor(private readonly securityService: SecurityService) {
    try {
      this.encryptionManager = this.securityService.getEncryptionManager();
    } catch (error) {
      // 如果 EncryptionManager 未初始化（未配置加密密钥），记录警告但不阻止应用启动
      this.logger.warn(
        'EncryptionManager not available. Encryption features will be disabled. ' +
        'To enable encryption, set AES_KEY or RSA_PUBLIC_KEY/RSA_PRIVATE_KEY environment variables.',
      );
      this.encryptionManager = undefined;
    }
  }

  /**
   * 检查加密功能是否可用
   */
  isEncryptionAvailable(): boolean {
    return this.encryptionManager !== undefined;
  }

  /**
   * 加密数据为 Base64 字符串
   */
  async encryptToBase64(data: string): Promise<string> {
    if (!this.encryptionManager) {
      throw new Error(
        'EncryptionManager not initialized. Please set AES_KEY or RSA_PUBLIC_KEY/RSA_PRIVATE_KEY environment variables.',
      );
    }
    const result = await this.encryptionManager.encrypt(data, {
      algorithm: 'aes-256-gcm',
    });

    // 将加密结果组合为 Base64 字符串
    const combined = JSON.stringify({
      encrypted: result.encrypted,
      iv: result.iv,
      tag: result.tag,
    });

    return Buffer.from(combined).toString('base64');
  }

  /**
   * 从 Base64 字符串解密数据
   */
  async decryptFromBase64(encryptedBase64: string): Promise<string> {
    if (!this.encryptionManager) {
      throw new Error(
        'EncryptionManager not initialized. Please set AES_KEY or RSA_PUBLIC_KEY/RSA_PRIVATE_KEY environment variables.',
      );
    }
    const combined = JSON.parse(
      Buffer.from(encryptedBase64, 'base64').toString('utf-8'),
    );

    const decrypted = await this.encryptionManager.decrypt(combined.encrypted, {
      iv: Buffer.isBuffer(combined.iv) ? combined.iv : Buffer.from(combined.iv, 'base64'),
      tag: combined.tag ? (Buffer.isBuffer(combined.tag) ? combined.tag : Buffer.from(combined.tag, 'base64')) : undefined,
    });

    return Buffer.isBuffer(decrypted) ? decrypted.toString('utf-8') : decrypted;
  }

  /**
   * 加密对象
   */
  async encryptObject<T>(data: T): Promise<string> {
    const jsonString = JSON.stringify(data);
    return this.encryptToBase64(jsonString);
  }

  /**
   * 解密对象
   */
  async decryptObject<T>(encryptedBase64: string): Promise<T> {
    const decrypted = await this.decryptFromBase64(encryptedBase64);
    return JSON.parse(decrypted) as T;
  }
}














