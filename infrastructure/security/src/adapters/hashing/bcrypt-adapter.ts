/**
 * bcrypt 哈希适配器
 */

import bcrypt from 'bcryptjs';
import type { HashingAdapter } from './hashing-adapter.interface.js';
import type { HashingAdapterConfig, HashingOptions } from '../../types/hashing.types.js';

export class BcryptAdapter implements HashingAdapter {
  private config: HashingAdapterConfig;

  constructor(config: HashingAdapterConfig) {
    this.config = {
      saltRounds: 10,
      ...config,
    };
  }

  async hash(data: string, options?: HashingOptions): Promise<string> {
    const saltRounds = options?.saltRounds || this.config.saltRounds || 10;
    return bcrypt.hash(data, saltRounds);
  }

  async verify(data: string, hash: string): Promise<boolean> {
    return bcrypt.compare(data, hash);
  }
}











