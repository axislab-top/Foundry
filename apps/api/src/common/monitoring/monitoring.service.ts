import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  MetricsManager,
  MetricAdapterType,
  MetricsManagerConfig,
} from '@service/monitoring';
import { ConfigService } from '../config/config.service.js';

/**
 * 监控服务
 * 封装 @service/monitoring 包，提供 NestJS 服务接口
 */
@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private metricsManager: MetricsManager;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const monitoringConfig = this.configService.getMonitoringConfig();

    if (!monitoringConfig.enabled) {
      return;
    }

    // 构建配置
    const adapterType = this.getAdapterType(monitoringConfig.adapter);
    const config: MetricsManagerConfig = {
      defaultAdapter: adapterType,
      adapters: [
        {
          adapter: adapterType,
          options: this.getAdapterOptions(adapterType, monitoringConfig),
        },
      ],
    };

    // 创建指标管理器
    MetricsManager.reset(); // 重置单例，确保使用新配置
    this.metricsManager = MetricsManager.create(config);
  }

  async onModuleDestroy() {
    if (this.metricsManager) {
      await this.metricsManager.close();
    }
  }

  /**
   * 获取适配器类型
   */
  private getAdapterType(adapter: string): MetricAdapterType {
    switch (adapter.toLowerCase()) {
      case 'prometheus':
        return MetricAdapterType.PROMETHEUS;
      case 'statsd':
        return MetricAdapterType.STATSD;
      case 'console':
        return MetricAdapterType.CONSOLE;
      case 'noop':
        return MetricAdapterType.NOOP;
      default:
        return MetricAdapterType.PROMETHEUS;
    }
  }

  /**
   * 获取适配器选项
   */
  private getAdapterOptions(adapterType: MetricAdapterType, config: any): any {
    switch (adapterType) {
      case MetricAdapterType.PROMETHEUS:
        return {
          collectDefaultMetrics: config.prometheus.collectDefaultMetrics,
          prefix: config.prometheus.prefix,
        };
      case MetricAdapterType.STATSD:
        return {
          host: process.env.STATSD_HOST || 'localhost',
          port: parseInt(process.env.STATSD_PORT || '8125', 10),
          prefix: process.env.STATSD_PREFIX || 'api_service',
        };
      default:
        return {};
    }
  }

  /**
   * 获取指标管理器
   */
  getMetricsManager(): MetricsManager | null {
    return this.metricsManager || null;
  }

  /**
   * 导出指标（Prometheus 格式）
   */
  async exportMetrics(): Promise<string> {
    if (!this.metricsManager) {
      return '';
    }
    return this.metricsManager.export();
  }
}






































