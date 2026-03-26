/**
 * 指标管理器
 * 
 * 提供统一的指标 API，支持多种后端适配器
 */

import { MetricAdapterType } from '../types/adapter.types.js';
import { AdapterConfig } from '../types/config.types.js';
import { MetricsManagerConfig } from '../types/config.types.js';
import {
  Counter,
  Gauge,
  Histogram,
  Summary,
  Metric,
} from '../types/metric.types.js';
import {
  MetricAdapter,
  CounterConfig,
  GaugeConfig,
  HistogramConfig,
  SummaryConfig,
  AdapterMetrics,
} from '../types/adapter.types.js';
import {
  PrometheusAdapter,
  ConsoleAdapter,
  NoOpAdapter,
  StatsDAdapter,
} from '../adapters/index.js';
import { MetricsRegistry } from './metrics-registry.js';

/**
 * 指标管理器
 */
export class MetricsManager {
  private static instance: MetricsManager | null = null;
  private adapters: Map<MetricAdapterType, MetricAdapter> = new Map();
  private defaultAdapterType: MetricAdapterType;
  private registry: MetricsRegistry;
  private collectInterval?: NodeJS.Timeout;

  private constructor(config: MetricsManagerConfig = {}) {
    this.registry = new MetricsRegistry();
    this.defaultAdapterType = config.defaultAdapter || MetricAdapterType.PROMETHEUS;

    // 初始化适配器
    if (config.adapters && config.adapters.length > 0) {
      for (const adapterConfig of config.adapters) {
        const adapter = this.createAdapter(adapterConfig);
        this.adapters.set(adapterConfig.adapter, adapter);
      }
    } else {
      // 如果没有配置适配器，创建默认适配器
      let defaultAdapterConfig: AdapterConfig;
      switch (this.defaultAdapterType) {
        case MetricAdapterType.PROMETHEUS:
          defaultAdapterConfig = { adapter: MetricAdapterType.PROMETHEUS };
          break;
        case MetricAdapterType.STATSD:
          defaultAdapterConfig = { adapter: MetricAdapterType.STATSD };
          break;
        case MetricAdapterType.CONSOLE:
          defaultAdapterConfig = { adapter: MetricAdapterType.CONSOLE };
          break;
        case MetricAdapterType.NOOP:
          defaultAdapterConfig = { adapter: MetricAdapterType.NOOP };
          break;
        default:
          throw new Error(`Unknown default adapter type: ${this.defaultAdapterType}`);
      }
      const defaultAdapter = this.createAdapter(defaultAdapterConfig);
      this.adapters.set(this.defaultAdapterType, defaultAdapter);
    }

    // 设置定期收集（如果启用）
    if (config.collectInterval && config.collectInterval > 0) {
      this.collectInterval = setInterval(() => {
        this.collect().catch(console.error);
      }, config.collectInterval);
    }
  }

  /**
   * 创建适配器实例
   */
  private createAdapter(config: AdapterConfig): MetricAdapter {
    switch (config.adapter) {
      case MetricAdapterType.PROMETHEUS:
        return new PrometheusAdapter(config.options);
      case MetricAdapterType.STATSD:
        return new StatsDAdapter(config.options);
      case MetricAdapterType.CONSOLE:
        return new ConsoleAdapter(config.options);
      case MetricAdapterType.NOOP:
        return new NoOpAdapter();
      default:
        const _exhaustive: never = config;
        throw new Error(`Unknown adapter type: ${(_exhaustive as any).adapter}`);
    }
  }

  /**
   * 创建指标管理器实例（单例模式）
   */
  static create(config: MetricsManagerConfig = {}): MetricsManager {
    if (!MetricsManager.instance) {
      MetricsManager.instance = new MetricsManager(config);
    }
    return MetricsManager.instance;
  }

  /**
   * 获取单例实例
   */
  static getInstance(): MetricsManager {
    if (!MetricsManager.instance) {
      throw new Error(
        'MetricsManager not initialized. Call MetricsManager.create() first.'
      );
    }
    return MetricsManager.instance;
  }

  /**
   * 重置单例（主要用于测试）
   */
  static reset(): void {
    if (MetricsManager.instance) {
      MetricsManager.instance.close();
      MetricsManager.instance = null;
    }
  }

  /**
   * 获取默认适配器
   */
  private getDefaultAdapter(): MetricAdapter {
    const adapter = this.adapters.get(this.defaultAdapterType);
    if (!adapter) {
      throw new Error(`Default adapter ${this.defaultAdapterType} not found`);
    }
    return adapter;
  }

  /**
   * 注册计数器
   */
  registerCounter(config: CounterConfig): Counter {
    const adapter = this.getDefaultAdapter();
    const counter = adapter.registerCounter(config);
    this.registry.registerCounter(config.name, counter);
    return counter;
  }

  /**
   * 注册仪表盘
   */
  registerGauge(config: GaugeConfig): Gauge {
    const adapter = this.getDefaultAdapter();
    const gauge = adapter.registerGauge(config);
    this.registry.registerGauge(config.name, gauge);
    return gauge;
  }

  /**
   * 注册直方图
   */
  registerHistogram(config: HistogramConfig): Histogram {
    const adapter = this.getDefaultAdapter();
    const histogram = adapter.registerHistogram(config);
    this.registry.registerHistogram(config.name, histogram);
    return histogram;
  }

  /**
   * 注册摘要
   */
  registerSummary(config: SummaryConfig): Summary {
    const adapter = this.getDefaultAdapter();
    const summary = adapter.registerSummary(config);
    this.registry.registerSummary(config.name, summary);
    return summary;
  }

  /**
   * 获取指标
   */
  getMetric(name: string): Metric | undefined {
    return this.registry.getMetric(name);
  }

  /**
   * 获取计数器
   */
  getCounter(name: string): Counter | undefined {
    return this.registry.getCounter(name);
  }

  /**
   * 获取仪表盘
   */
  getGauge(name: string): Gauge | undefined {
    return this.registry.getGauge(name);
  }

  /**
   * 获取直方图
   */
  getHistogram(name: string): Histogram | undefined {
    return this.registry.getHistogram(name);
  }

  /**
   * 获取摘要
   */
  getSummary(name: string): Summary | undefined {
    return this.registry.getSummary(name);
  }

  /**
   * 收集所有指标数据
   */
  async collect(): Promise<AdapterMetrics> {
    const adapter = this.getDefaultAdapter();
    return adapter.collect();
  }

  /**
   * 导出指标
   */
  async export(format?: string): Promise<string> {
    const adapter = this.getDefaultAdapter();
    return adapter.export(format);
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    this.registry.reset();
    for (const adapter of this.adapters.values()) {
      adapter.reset();
    }
  }

  /**
   * 获取注册表
   */
  getRegistry(): MetricsRegistry {
    return this.registry;
  }

  /**
   * 获取适配器
   */
  getAdapter(type: MetricAdapterType): MetricAdapter | undefined {
    return this.adapters.get(type);
  }

  /**
   * 关闭管理器（清理资源）
   */
  async close(): Promise<void> {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = undefined;
    }

    for (const adapter of this.adapters.values()) {
      await adapter.close();
    }

    this.adapters.clear();
    this.registry.clear();
  }
}


