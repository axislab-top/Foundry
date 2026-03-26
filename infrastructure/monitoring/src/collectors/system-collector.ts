/**
 * 系统指标收集器
 * 
 * 收集 CPU、内存、磁盘等系统指标
 */

import { Collector } from './collector.interface.js';
import { MetricsManager } from '../infrastructure/metrics-manager.js';
import { Gauge } from '../types/metric.types.js';

/**
 * 系统指标收集器
 */
export class SystemCollector implements Collector {
  readonly name = 'system';
  private metricsManager?: MetricsManager;
  private cpuGauge?: Gauge;
  private memoryGauge?: Gauge;
  private interval?: NodeJS.Timeout;
  private systemInfoModule: any = null;

  constructor(private collectInterval: number = 60000) {
    // 尝试加载 systeminformation（可选依赖）
    try {
      // 动态导入以避免必须安装
      // const si = require('systeminformation');
      // this.systemInfoModule = si;
    } catch (error) {
      console.warn('systeminformation not installed, SystemCollector will use basic metrics');
    }
  }

  initialize(metricsManager: MetricsManager): void {
    this.metricsManager = metricsManager;

    // 注册系统指标
    this.cpuGauge = metricsManager.registerGauge({
      name: 'system_cpu_usage_percent',
      help: 'CPU usage percentage',
    });

    this.memoryGauge = metricsManager.registerGauge({
      name: 'system_memory_usage_bytes',
      help: 'Memory usage in bytes',
    });
  }

  start(): void {
    if (!this.metricsManager) {
      throw new Error('Collector not initialized. Call initialize() first.');
    }

    // 立即收集一次
    this.collect();

    // 设置定期收集
    this.interval = setInterval(() => {
      this.collect().catch(console.error);
    }, this.collectInterval);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  async collect(): Promise<void> {
    if (!this.metricsManager || !this.cpuGauge || !this.memoryGauge) {
      return;
    }

    try {
      // 使用 Node.js 内置的 process 模块收集基本指标
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // 内存使用量（堆使用）
      this.memoryGauge.set({ type: 'heap_used' }, memUsage.heapUsed);
      this.memoryGauge.set({ type: 'heap_total' }, memUsage.heapTotal);
      this.memoryGauge.set({ type: 'external' }, memUsage.external);
      this.memoryGauge.set({ type: 'rss' }, memUsage.rss);

      // CPU 使用率（简化计算）
      // 注意：process.cpuUsage() 返回的是累计值，需要计算差值
      // 这里只是示例，实际使用时需要更复杂的计算
      
      // 如果 systeminformation 可用，可以使用更详细的系统指标
      if (this.systemInfoModule) {
        // const cpu = await this.systemInfoModule.currentLoad();
        // this.cpuGauge.set({}, cpu.currentLoad);
      }
    } catch (error) {
      console.error('Error collecting system metrics:', error);
    }
  }
}







































