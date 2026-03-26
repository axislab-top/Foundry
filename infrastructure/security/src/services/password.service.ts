/**
 * 密码服务
 */

import { HashingManager } from '../infrastructure/hashing-manager.js';
import type { HashingAdapterType, HashingOptions } from '../types/hashing.types.js';
import { validatePasswordStrength } from '../utils/validation.utils.js';

export class PasswordService {
  private hashingManager: HashingManager;

  constructor(hashingManager: HashingManager) {
    this.hashingManager = hashingManager;
  }

  /**
   * 哈希密码
   */
  async hashPassword(
    password: string,
    options?: HashingOptions,
    adapter?: HashingAdapterType,
  ): Promise<string> {
    return this.hashingManager.hash(password, options, adapter);
  }

  /**
   * 验证密码
   */
  async verifyPassword(
    password: string,
    hash: string,
    adapter?: HashingAdapterType,
  ): Promise<boolean> {
    return this.hashingManager.verify(password, hash, adapter);
  }

  /**
   * 验证密码强度
   */
  validatePasswordStrength(password: string) {
    return validatePasswordStrength(password);
  }
}






































