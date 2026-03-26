import { Controller, Get, Header } from '@nestjs/common';
import { MonitoringService } from '../monitoring.service.js';

/**
 * Metrics 控制器（Worker）
 * 提供 Prometheus 格式的指标导出端点
 *
 * 实际路径：/api/metrics（由于全局前缀 'api'）
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly monitoringService: MonitoringService) {}

  /**
   * 导出 Prometheus 文本格式指标
   */
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return await this.monitoringService.exportMetrics();
  }
}











