import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { MonitoringService } from './monitoring.service.js';
import { MetricsController } from './controllers/metrics.controller.js';
import { MetricsInterceptor } from './interceptors/metrics.interceptor.js';

/**
 * 监控模块
 * 全局模块，提供监控服务和 /metrics 端点
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [MonitoringService, MetricsInterceptor],
  controllers: [MetricsController],
  exports: [MonitoringService, MetricsInterceptor],
})
export class MonitoringModule {}

