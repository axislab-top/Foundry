/**
 * Console 适配器
 * 
 * 用于开发环境的控制台输出适配器
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
 * Console 适配器选项
 */
export interface ConsoleAdapterOptions {
  /**
   * 是否启用日志输出
   */
  enabled?: boolean;

  /**
   * 日志级别（debug, info, warn, error）
   */
  level?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * 控制台计数器实现
 */
class ConsoleCounter implements Counter {
  private value: number = 0;
  private labelValues: Map<string, number> = new Map();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = []
  ) {}

  inc(labels?: MetricLabels, value: number = 1): void {
    if (labels) {
      const key = this.getLabelKey(labels);
      const current = this.labelValues.get(key) || 0;
      this.labelValues.set(key, current + value);
    } else {
      this.value += value;
    }
  }

  get(labels?: MetricLabels): number {
    if (labels) {
      const key = this.getLabelKey(labels);
      return this.labelValues.get(key) || 0;
    }
    return this.value;
  }

  reset(): void {
    this.value = 0;
    this.labelValues.clear();
  }

  private getLabelKey(labels: MetricLabels): string {
    return JSON.stringify(labels);
  }
}

/**
 * 控制台仪表盘实现
 */
class ConsoleGauge implements Gauge {
  private value: number = 0;
  private labelValues: Map<string, number> = new Map();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = []
  ) {}

  set(labels: MetricLabels, value: number): void {
    const key = this.getLabelKey(labels);
    this.labelValues.set(key, value);
  }

  inc(labels?: MetricLabels, value: number = 1): void {
    if (labels) {
      const key = this.getLabelKey(labels);
      const current = this.labelValues.get(key) || 0;
      this.labelValues.set(key, current + value);
    } else {
      this.value += value;
    }
  }

  dec(labels?: MetricLabels, value: number = 1): void {
    if (labels) {
      const key = this.getLabelKey(labels);
      const current = this.labelValues.get(key) || 0;
      this.labelValues.set(key, current - value);
    } else {
      this.value -= value;
    }
  }

  get(labels?: MetricLabels): number {
    if (labels) {
      const key = this.getLabelKey(labels);
      return this.labelValues.get(key) || 0;
    }
    return this.value;
  }

  reset(): void {
    this.value = 0;
    this.labelValues.clear();
  }

  private getLabelKey(labels: MetricLabels): string {
    return JSON.stringify(labels);
  }
}

/**
 * 控制台直方图实现（简化版）
 */
class ConsoleHistogram implements Histogram {
  private values: number[] = [];
  private labelValues: Map<string, number[]> = new Map();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = []
  ) {}

  observe(labels: MetricLabels, value: number): void {
    const key = this.getLabelKey(labels);
    const list = this.labelValues.get(key) || [];
    list.push(value);
    this.labelValues.set(key, list);
  }

  startTimer(labels?: MetricLabels): () => number {
    const start = Date.now();
    return () => {
      const duration = (Date.now() - start) / 1000;
      if (labels) {
        this.observe(labels, duration);
      } else {
        this.values.push(duration);
      }
      return duration;
    };
  }

  get(labels?: MetricLabels): HistogramValue {
    const values = labels ? (this.labelValues.get(this.getLabelKey(labels)) || []) : this.values;
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;

    return {
      sum,
      count,
      buckets: [],
    };
  }

  reset(): void {
    this.values = [];
    this.labelValues.clear();
  }

  private getLabelKey(labels: MetricLabels): string {
    return JSON.stringify(labels);
  }
}

/**
 * 控制台摘要实现（简化版）
 */
class ConsoleSummary implements Summary {
  private values: number[] = [];
  private labelValues: Map<string, number[]> = new Map();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = []
  ) {}

  observe(labels: MetricLabels, value: number): void {
    const key = this.getLabelKey(labels);
    const list = this.labelValues.get(key) || [];
    list.push(value);
    this.labelValues.set(key, list);
  }

  startTimer(labels?: MetricLabels): () => number {
    const start = Date.now();
    return () => {
      const duration = (Date.now() - start) / 1000;
      if (labels) {
        this.observe(labels, duration);
      } else {
        this.values.push(duration);
      }
      return duration;
    };
  }

  get(labels?: MetricLabels): SummaryValue {
    const values = labels ? (this.labelValues.get(this.getLabelKey(labels)) || []) : this.values;
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;
    const sorted = [...values].sort((a, b) => a - b);

    return {
      sum,
      count,
      quantiles: [],
    };
  }

  reset(): void {
    this.values = [];
    this.labelValues.clear();
  }

  private getLabelKey(labels: MetricLabels): string {
    return JSON.stringify(labels);
  }
}

/**
 * Console 适配器实现
 */
export class ConsoleAdapter extends BaseMetricAdapter {
  readonly name = 'console';
  private metrics: Map<string, Counter | Gauge | Histogram | Summary> = new Map();
  private options: ConsoleAdapterOptions;

  constructor(options: ConsoleAdapterOptions = {}) {
    super();
    this.options = {
      enabled: options.enabled !== false,
      level: options.level || 'info',
    };
  }

  registerCounter(config: CounterConfig): Counter {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof ConsoleCounter) {
        return existing;
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const counter = new ConsoleCounter(name, config.help, config.labelNames);
    this.metrics.set(name, counter);
    return counter;
  }

  registerGauge(config: GaugeConfig): Gauge {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof ConsoleGauge) {
        return existing;
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const gauge = new ConsoleGauge(name, config.help, config.labelNames);
    this.metrics.set(name, gauge);
    return gauge;
  }

  registerHistogram(config: HistogramConfig): Histogram {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof ConsoleHistogram) {
        return existing;
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const histogram = new ConsoleHistogram(name, config.help, config.labelNames);
    this.metrics.set(name, histogram);
    return histogram;
  }

  registerSummary(config: SummaryConfig): Summary {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof ConsoleSummary) {
        return existing;
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const summary = new ConsoleSummary(name, config.help, config.labelNames);
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
      if (metric instanceof ConsoleCounter) {
        result.counters.push({ name, labels: {}, value: metric.get() });
      } else if (metric instanceof ConsoleGauge) {
        result.gauges.push({ name, labels: {}, value: metric.get() });
      } else if (metric instanceof ConsoleHistogram) {
        const value = metric.get();
        result.histograms.push({ name, labels: {}, value });
      } else if (metric instanceof ConsoleSummary) {
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

    // 默认格式化为可读字符串
    const lines: string[] = [];
    lines.push('# Console Metrics');
    lines.push('');

    if (metrics.counters.length > 0) {
      lines.push('## Counters');
      for (const counter of metrics.counters) {
        lines.push(`${counter.name} = ${counter.value}`);
      }
      lines.push('');
    }

    if (metrics.gauges.length > 0) {
      lines.push('## Gauges');
      for (const gauge of metrics.gauges) {
        lines.push(`${gauge.name} = ${gauge.value}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  reset(): void {
    for (const metric of this.metrics.values()) {
      metric.reset();
    }
  }
}







































