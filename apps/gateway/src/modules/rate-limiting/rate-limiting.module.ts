import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '../../common/config/config.module.js';
import { CacheModule } from '../../common/cache/cache.module.js';
import { MonitoringModule } from '../../common/monitoring/monitoring.module.js';
import { RateLimitingService } from './rate-limiting.service.js';
import { BaseRateLimitStrategy } from './strategies/base-rate-limit.strategy.js';
import { IpRateLimitStrategy } from './strategies/ip-rate-limit.strategy.js';
import { UserRateLimitStrategy } from './strategies/user-rate-limit.strategy.js';
import { ApiRateLimitStrategy } from './strategies/api-rate-limit.strategy.js';
import { RateLimitGuard } from './guards/rate-limit.guard.js';
import { ThrottleGuard } from './guards/throttle.guard.js';

/**
 * 限流模块
 */
@Module({
  imports: [ConfigModule, CacheModule, MonitoringModule],
  providers: [
    RateLimitingService,
    BaseRateLimitStrategy,
    IpRateLimitStrategy,
    UserRateLimitStrategy,
    ApiRateLimitStrategy,
    RateLimitGuard,
    ThrottleGuard,
  ],
  exports: [RateLimitingService, RateLimitGuard, ThrottleGuard],
})
export class RateLimitingModule {}









