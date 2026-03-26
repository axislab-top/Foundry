import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CacheService } from '../../cache/cache.service.js';

/**
 * Nonce服务
 * 管理请求nonce，防止重放攻击
 */
@Injectable()
export class NonceService {
  private readonly CACHE_PREFIX = 'nonce:';
  private readonly DEFAULT_TTL = 600; // 默认10分钟（600秒）

  constructor(private readonly cacheService: CacheService) {}

  /**
   * 生成nonce
   */
  generateNonce(): string {
    return randomUUID();
  }

  /**
   * 验证nonce（检查是否已使用）
   * @param nonce - 要验证的nonce
   * @param ttl - 过期时间（秒），默认10分钟
   * @returns true如果nonce有效（未使用），false如果已使用
   */
  async validateNonce(nonce: string, ttl: number = this.DEFAULT_TTL): Promise<boolean> {
    const cacheKey = this.getCacheKey(nonce);

    // 检查nonce是否已存在
    const exists = await this.cacheService.exists(cacheKey);

    if (exists) {
      // nonce已使用
      return false;
    }

    // 标记nonce为已使用
    await this.cacheService.set(cacheKey, '1', ttl);

    return true;
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(nonce: string): string {
    return `${this.CACHE_PREFIX}${nonce}`;
  }
}











