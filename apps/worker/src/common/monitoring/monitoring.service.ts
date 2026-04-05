import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  MetricsManager,
  createMetricsConfigFromEnv,
  type Counter,
  type Histogram,
} from '@service/monitoring';

/**
 * 监控服务（Worker）
 * 使用 @service/monitoring 初始化全局 MetricsManager
 */
@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private metricsManager: MetricsManager | null = null;
  private taskRunOutcome: Counter | null = null;
  private ceoHeartbeatDuration: Histogram | null = null;

  onModuleInit() {
    const config = createMetricsConfigFromEnv();
    this.metricsManager = MetricsManager.create(config);
    this.taskRunOutcome = this.metricsManager.registerCounter({
      name: 'worker_task_run_outcome_total',
      help: 'CEO heartbeat task_runs completed or failed',
      labelNames: ['outcome', 'trigger_source'],
    });
    this.ceoHeartbeatDuration = this.metricsManager.registerHistogram({
      name: 'worker_ceo_heartbeat_cycle_seconds',
      help: 'CEO heartbeat run cycle wall time',
      labelNames: ['trigger_source'],
      buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    });
  }

  recordTaskRunOutcome(outcome: 'success' | 'failed', triggerSource: string): void {
    this.taskRunOutcome?.inc({ outcome, trigger_source: triggerSource });
  }

  observeCeoHeartbeatSeconds(triggerSource: string, seconds: number): void {
    this.ceoHeartbeatDuration?.observe({ trigger_source: triggerSource }, seconds);
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











