/**
 * StatsD 适配器
 * 
 * 使用 hot-shots 库实现 StatsD 协议（可选依赖）
 */

import { BaseMetricAdapter } from './metric-adapter.interface.js';
import {
  Counter,
  Gauge,
  Histogram,
  Summary,
  MetricLabels,
  HistogramValue,
  SummaryValue,
} from '../types/metric.types.js';
import {
  CounterConfig,
  GaugeConfig,
  HistogramConfig,
  SummaryConfig,
  AdapterMetrics,
} from '../types/adapter.types.js';

/**
 * StatsD 适配器选项
 */
export interface StatsDAdapterOptions {
  /**
   * StatsD 服务器主机
   */
  host?: string;

  /**
   * StatsD 服务器端口
   */
  port?: number;

  /**
   * 指标前缀
   */
  prefix?: string;

  /**
   * 采样率（0-1）
   */
  sampleRate?: number;

  /**
   * 缓存指标（批量发送）
   */
  cacheDns?: boolean;

  /**
   * 错误处理回调
   */
  errorHandler?: (error: Error) => void;
}

/**
 * StatsD 计数器实现（简化版，实际使用时会发送到 StatsD 服务器）
 */
class StatsDCounter implements Counter {
  private value: number = 0;
  private client: any;

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = [],
    client?: any
  ) {
    this.client = client;
  }

  inc(labels?: MetricLabels, value: number = 1): void {
    this.value += value;
    if (this.client) {
      // 实际实现中会调用 client.increment
      // this.client.increment(this.name, value, labels);
    }
  }

  get(labels?: MetricLabels): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}

/**
 * StatsD 仪表盘实现
 */
class StatsDGauge implements Gauge {
  private value: number = 0;
  private client: any;

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = [],
    client?: any
  ) {
    this.client = client;
  }

  set(labels: MetricLabels, value: number): void {
    this.value = value;
    if (this.client) {
      // this.client.gauge(this.name, value, labels);
    }
  }

  inc(labels?: MetricLabels, value: number = 1): void {
    this.value += value;
    if (this.client) {
      // this.client.increment(this.name, value, labels);
    }
  }

  dec(labels?: MetricLabels, value: number = 1): void {
    this.value -= value;
    if (this.client) {
      // this.client.decrement(this.name, value, labels);
    }
  }

  get(labels?: MetricLabels): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}

/**
 * StatsD 直方图实现（简化版）
 */
class StatsDHistogram implements Histogram {
  private values: number[] = [];
  private client: any;

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = [],
    client?: any
  ) {
    this.client = client;
  }

  observe(labels: MetricLabels, value: number): void {
    this.values.push(value);
    if (this.client) {
      // this.client.histogram(this.name, value, labels);
    }
  }

  startTimer(labels?: MetricLabels): () => number {
    const start = Date.now();
    return () => {
      const duration = (Date.now() - start) / 1000;
      this.observe(labels || {}, duration);
      return duration;
    };
  }

  get(labels?: MetricLabels): HistogramValue {
    const sum = this.values.reduce((a, b) => a + b, 0);
    const count = this.values.length;
    return { sum, count, buckets: [] };
  }

  reset(): void {
    this.values = [];
  }
}

/**
 * StatsD 摘要实现（简化版）
 */
class StatsDSummary implements Summary {
  private values: number[] = [];
  private client: any;

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = [],
    client?: any
  ) {
    this.client = client;
  }

  observe(labels: MetricLabels, value: number): void {
    this.values.push(value);
    if (this.client) {
      // this.client.timing(this.name, value, labels);
    }
  }

  startTimer(labels?: MetricLabels): () => number {
    const start = Date.now();
    return () => {
      const duration = (Date.now() - start) / 1000;
      this.observe(labels || {}, duration);
      return duration;
    };
  }

  get(labels?: MetricLabels): SummaryValue {
    const sum = this.values.reduce((a, b) => a + b, 0);
    const count = this.values.length;
    return { sum, count, quantiles: [] };
  }

  reset(): void {
    this.values = [];
  }
}

/**
 * StatsD 适配器实现
 * 
 * 注意：此实现为简化版，实际使用时需要安装 hot-shots 包
 */
export class StatsDAdapter extends BaseMetricAdapter {
  readonly name = 'statsd';
  private metrics: Map<string, Counter | Gauge | Histogram | Summary> = new Map();
  private options: StatsDAdapterOptions;
  private client: any = null;

  constructor(options: StatsDAdapterOptions = {}) {
    super();
    this.options = {
      host: options.host || 'localhost',
      port: options.port || 8125,
      prefix: options.prefix,
      sampleRate: options.sampleRate || 1,
      ...options,
    };

    // 尝试加载 hot-shots（可选依赖）
    try {
      // 动态导入以避免必须安装
      // const StatsD = require('hot-shots');
      // this.client = new StatsD(this.options);
    } catch (error) {
      // hot-shots 未安装，使用简化实现
      console.warn('hot-shots not installed, StatsD adapter will use simplified implementation');
    }
  }

  registerCounter(config: CounterConfig): Counter {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof StatsDCounter) {
        return existing;
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const counter = new StatsDCounter(name, config.help, config.labelNames, this.client);
    this.metrics.set(name, counter);
    return counter;
  }

  registerGauge(config: GaugeConfig): Gauge {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof StatsDGauge) {
        return existing;
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const gauge = new StatsDGauge(name, config.help, config.labelNames, this.client);
    this.metrics.set(name, gauge);
    return gauge;
  }

  registerHistogram(config: HistogramConfig): Histogram {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof StatsDHistogram) {
        return existing;
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const histogram = new StatsDHistogram(name, config.help, config.labelNames, this.client);
    this.metrics.set(name, histogram);
    return histogram;
  }

  registerSummary(config: SummaryConfig): Summary {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof StatsDSummary) {
        return existing;
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const summary = new StatsDSummary(name, config.help, config.labelNames, this.client);
    this.metrics.set(name, summary);
    return summary;
  }

  async collect(): Promise<AdapterMetrics> {
    const result: AdapterMetrics = {
      counters: [],
      gauges: [],
      histograms: [],
      summaries: [],
    };

    for (const [name, metric] of this.metrics.entries()) {
      if (metric instanceof StatsDCounter) {
        result.counters.push({ name, labels: {}, value: metric.get() });
      } else if (metric instanceof StatsDGauge) {
        result.gauges.push({ name, labels: {}, value: metric.get() });
      } else if (metric instanceof StatsDHistogram) {
        const value = metric.get();
        result.histograms.push({ name, labels: {}, value });
      } else if (metric instanceof StatsDSummary) {
        const value = metric.get();
        result.summaries.push({ name, labels: {}, value });
      }
    }

    return result;
  }

  async export(format?: string): Promise<string> {
    const metrics = await this.collect();
    
    if (format === 'json') {
      return JSON.stringify(metrics, null, 2);
    }

    return JSON.stringify(metrics);
  }

  reset(): void {
    for (const metric of this.metrics.values()) {
      metric.reset();
    }
  }

  async close(): Promise<void> {
    if (this.client && typeof this.client.close === 'function') {
      this.client.close();
    }
  }
}







































