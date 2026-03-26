import { Injectable } from '@nestjs/common';
import { BaseRateLimitStrategy } from './base-rate-limit.strategy.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import {
  IRateLimitStrategy,
  RateLimitResult,
} from '../interfaces/rate-limit.interface.js';
import { RateLimitConfig } from '../config/rate-limit.config.js';

/**
 * API 限流策略
 */
@Injectable()
export class ApiRateLimitStrategy
  extends BaseRateLimitStrategy
  implements IRateLimitStrategy
{
  constructor(cacheService: CacheService) {
    super(cacheService);
  }

  async checkLimit(
    apiPath: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const identifier = `api:${apiPath}`;
    return super.checkLimit(identifier, config);
  }
}


















