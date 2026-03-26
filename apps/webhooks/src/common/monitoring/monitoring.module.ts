import { Module, Global } from '@nestjs/common';
import { MonitoringService } from './monitoring.service.js';
import { MetricsController } from './controllers/metrics.controller.js';

/**
 * 监控模块（Webhooks）
 * 全局模块，提供监控服务和 /metrics 端点
 */
@Global()
@Module({
  imports: [],
  providers: [MonitoringService],
  controllers: [MetricsController],
  exports: [MonitoringService],
})
export class MonitoringModule {}











