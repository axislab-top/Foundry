import { Injectable } from '@nestjs/common';
import { BaseRateLimitStrategy } from './base-rate-limit.strategy.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import {
  IRateLimitStrategy,
  RateLimitResult,
} from '../interfaces/rate-limit.interface.js';
import { RateLimitConfig } from '../config/rate-limit.config.js';

/**
 * 用户限流策略
 */
@Injectable()
export class UserRateLimitStrategy
  extends BaseRateLimitStrategy
  implements IRateLimitStrategy
{
  constructor(cacheService: CacheService) {
    super(cacheService);
  }

  async checkLimit(
    userId: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const identifier = `user:${userId}`;
    return super.checkLimit(identifier, config);
  }
}


















