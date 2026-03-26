/**
 * Argon2 哈希适配器
 */

import type { HashingAdapter } from './hashing-adapter.interface.js';
import type { HashingAdapterConfig, HashingOptions } from '../../types/hashing.types.js';

let argon2: any;

try {
  argon2 = require('argon2');
} catch {
  // Argon2 是可选的
}

export class Argon2Adapter implements HashingAdapter {
  private config: HashingAdapterConfig;

  constructor(config: HashingAdapterConfig) {
    if (!argon2) {
      throw new Error('argon2 package is not installed. Install it with: pnpm add argon2');
    }
    this.config = {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      ...config,
    };
  }

  async hash(data: string, options?: HashingOptions): Promise<string> {
    const memoryCost = options?.memoryCost || this.config.memoryCost || 65536;
    const timeCost = options?.timeCost || this.config.timeCost || 3;
    const parallelism = options?.parallelism || this.config.parallelism || 4;

    return argon2.hash(data, {
      type: argon2.argon2id,
      memoryCost,
      timeCost,
      parallelism,
    });
  }

  async verify(data: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, data);
    } catch {
      return false;
    }
  }
}






































