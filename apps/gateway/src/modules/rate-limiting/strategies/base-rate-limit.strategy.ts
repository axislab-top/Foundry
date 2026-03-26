import { Injectable } from '@nestjs/common';
import { CacheService } from '../../../common/cache/cache.service.js';
import {
  IRateLimitStrategy,
  RateLimitResult,
} from '../interfaces/rate-limit.interface.js';
import { RateLimitConfig } from '../config/rate-limit.config.js';

/**
 * 基础限流策略
 * 使用滑动窗口算法
 */
@Injectable()
export class BaseRateLimitStrategy implements IRateLimitStrategy {
  constructor(private readonly cacheService: CacheService) {}

  async checkLimit(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const key = `rate-limit:${identifier}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - config.ttl;

    // 获取当前计数
    let count = await this.cacheService.get<number>(key);

    if (count === null) {
      count = 0;
    }

    // 检查是否超过限制
    const allowed = count < config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - count);
    const resetTime = now + config.ttl;

    if (allowed) {
      // 增加计数
      const newCount = await this.cacheService.increment(key, 1);
      
      // 如果是新键，设置过期时间
      if (newCount === 1) {
        await this.cacheService.expire(key, config.ttl);
      }
    }

    return {
      allowed,
      remaining,
      resetTime,
      limit: config.maxRequests,
    };
  }
}


















