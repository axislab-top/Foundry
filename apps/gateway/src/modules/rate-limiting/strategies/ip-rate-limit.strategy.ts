import { Injectable } from '@nestjs/common';
import { BaseRateLimitStrategy } from './base-rate-limit.strategy.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import {
  IRateLimitStrategy,
  RateLimitResult,
} from '../interfaces/rate-limit.interface.js';
import { RateLimitConfig } from '../config/rate-limit.config.js';

/**
 * IP 限流策略
 */
@Injectable()
export class IpRateLimitStrategy
  extends BaseRateLimitStrategy
  implements IRateLimitStrategy
{
  constructor(cacheService: CacheService) {
    super(cacheService);
  }

  async checkLimit(
    ip: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const identifier = `ip:${ip}`;
    return super.checkLimit(identifier, config);
  }
}


















