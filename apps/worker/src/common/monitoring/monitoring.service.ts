import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MetricsManager, createMetricsConfigFromEnv } from '@service/monitoring';

/**
 * 监控服务（Worker）
 * 使用 @service/monitoring 初始化全局 MetricsManager
 */
@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private metricsManager: MetricsManager | null = null;

  onModuleInit() {
    const config = createMetricsConfigFromEnv();
    this.metricsManager = MetricsManager.create(config);
  }

  async onModuleDestroy() {
    if (this.metricsManager) {
      await this.metricsManager.close();
    }
  }

  /**
   * 导出 Prometheus 格式的指标
   */
  async exportMetrics(): Promise<string> {
    if (!this.metricsManager) {
      return '';
    }
    return this.metricsManager.export();
  }
}











