/**
 * 加密适配器接口
 */

import type {
  EncryptionOptions,
  EncryptionResult,
  DecryptionOptions,
} from '../../types/encryption.types.js';

export interface EncryptionAdapter {
  /**
   * 加密数据
   */
  encrypt(data: string | Buffer, options?: EncryptionOptions): Promise<EncryptionResult>;

  /**
   * 解密数据
   */
  decrypt(
    encrypted: string | Buffer,
    options?: DecryptionOptions,
  ): Promise<string | Buffer>;
}






































