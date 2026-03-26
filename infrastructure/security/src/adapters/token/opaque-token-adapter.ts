/**
 * 不透明令牌适配器（简单实现，实际应使用数据库存储）
 */

import { randomBytes, createHash } from 'crypto';
import type { TokenAdapter } from './token-adapter.interface.js';
import type {
  JwtPayload,
  RefreshTokenPayload,
  TokenAdapterConfig,
  TokenOptions,
  TokenVerifyOptions,
} from '../../types/token.types.js';

/**
 * 简单的内存存储（生产环境应使用 Redis 或数据库）
 */
const tokenStore = new Map<string, { payload: JwtPayload | RefreshTokenPayload; expiresAt: number }>();

export class OpaqueTokenAdapter implements TokenAdapter {
  private config: TokenAdapterConfig;
  private defaultExpiresIn: number;

  constructor(config: TokenAdapterConfig) {
    this.config = config;
    this.defaultExpiresIn = this.parseExpiresIn(
      typeof config.expiresIn === 'string' ? config.expiresIn : '15m',
    );
  }

  async sign(
    payload: JwtPayload | RefreshTokenPayload,
    options?: TokenOptions,
  ): Promise<string> {
    const expiresIn = options?.expiresIn || this.config.expiresIn || '15m';
    const expiresInSeconds = this.parseExpiresIn(
      typeof expiresIn === 'string' ? expiresIn : `${expiresIn}s`,
    );
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    // 生成随机令牌
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);

    // 存储令牌信息
    tokenStore.set(tokenHash, {
      payload,
      expiresAt,
    });

    return token;
  }

  async verify<T = JwtPayload>(
    token: string,
    options?: TokenVerifyOptions,
  ): Promise<T> {
    const tokenHash = this.hashToken(token);
    const stored = tokenStore.get(tokenHash);

    if (!stored) {
      throw new Error('Token not found');
    }

    if (stored.expiresAt < Date.now()) {
      tokenStore.delete(tokenHash);
      throw new Error('Token expired');
    }

    return stored.payload as T;
  }

  decode<T = JwtPayload>(token: string): T | null {
    try {
      const tokenHash = this.hashToken(token);
      const stored = tokenStore.get(tokenHash);
      return stored ? (stored.payload as T) : null;
    } catch {
      return null;
    }
  }

  /**
   * 删除令牌
   */
  async revoke(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    tokenStore.delete(tokenHash);
  }

  /**
   * 清理过期令牌
   */
  cleanup(): void {
    const now = Date.now();
    for (const [hash, { expiresAt }] of tokenStore.entries()) {
      if (expiresAt < now) {
        tokenStore.delete(hash);
      }
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 900; // 默认15分钟
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 900;
    }
  }
}






































