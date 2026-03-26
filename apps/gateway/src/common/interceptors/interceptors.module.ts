import { Module, Global } from '@nestjs/common';
import { LoggingInterceptor } from './logging.interceptor.js';
import { TransformInterceptor } from './transform.interceptor.js';
import { TimeoutInterceptor } from './timeout.interceptor.js';
import { PerformanceInterceptor } from './performance.interceptor.js';
import { SecurityModule } from '../security/security.module.js';
import { ConfigModule } from '../config/config.module.js';

/**
 * 拦截器模块
 * 提供全局拦截器
 * 
 * 注意：验证错误现在由异常过滤器统一处理，不再需要 ValidationErrorInterceptor
 */
@Global()
@Module({
  imports: [SecurityModule, ConfigModule],
  providers: [
    LoggingInterceptor,
    TransformInterceptor,
    TimeoutInterceptor,
    PerformanceInterceptor,
  ],
  exports: [
    LoggingInterceptor,
    TransformInterceptor,
    TimeoutInterceptor,
    PerformanceInterceptor,
  ],
})
export class InterceptorsModule {}























