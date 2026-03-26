import { Module, Global } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module.js';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { ConfigModule } from '../config/config.module.js';
import { CircuitBreakerService } from './services/circuit-breaker.service.js';
import { CircuitBreakerInterceptor } from './interceptors/circuit-breaker.interceptor.js';
import { RetryService } from './services/retry.service.js';

/**
 * 弹性模块
 * 提供断路器、重试等弹性功能
 */
@Global()
@Module({
  imports: [CacheModule, MonitoringModule, ConfigModule],
  providers: [CircuitBreakerService, CircuitBreakerInterceptor, RetryService],
  exports: [CircuitBreakerService, CircuitBreakerInterceptor, RetryService],
})
export class ResilienceModule {}


