import { Module } from '@nestjs/common';
import { ResilienceModule } from '../../common/resilience/resilience.module.js';
import { ConfigModule } from '../../common/config/config.module.js';
import { CircuitBreakerGuard } from './guards/circuit-breaker.guard.js';

/**
 * 断路器模块
 * 提供断路器相关的守卫和控制器
 */
@Module({
  imports: [ResilienceModule, ConfigModule],
  providers: [CircuitBreakerGuard],
  exports: [CircuitBreakerGuard],
})
export class CircuitBreakerModule {}































