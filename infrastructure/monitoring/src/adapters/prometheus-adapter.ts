/**
 * Prometheus 适配器
 * 
 * 使用 prom-client 库实现 Prometheus 指标格式
 */

import { Registry, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from 'prom-client';
import { BaseMetricAdapter } from './metric-adapter.interface.js';
import {
  Counter as ICounter,
  Gauge as IGauge,
  Histogram as IHistogram,
  Summary as ISummary,
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
 * Prometheus 适配器选项
 */
export interface PrometheusAdapterOptions {
  /**
   * 注册表实例（可选，默认创建新实例）
   */
  registry?: Registry;

  /**
   * 是否收集默认指标（CPU、内存等）
   */
  collectDefaultMetrics?: boolean;

  /**
   * 默认指标收集间隔（毫秒）
   */
  defaultMetricsInterval?: number;

  /**
   * 指标前缀
   */
  prefix?: string;
}

/**
 * Prometheus 计数器包装
 */
class PrometheusCounterWrapper implements ICounter {
  private counter: Counter<string>;
  private _name: string;
  private _help: string;
  private _labelNames: readonly string[];

  constructor(counter: Counter<string>, name: string, help: string, labelNames: readonly string[] = []) {
    this.counter = counter;
    this._name = name;
    this._help = help;
    this._labelNames = labelNames;
  }

  get name(): string {
    return this._name;
  }

  get help(): string {
    return this._help;
  }

  get labelNames(): readonly string[] {
    return this._labelNames;
  }

  inc(labels?: MetricLabels, value: number = 1): void {
    if (labels) {
      this.counter.inc(labels, value);
    } else {
      this.counter.inc(value);
    }
  }

  async get(labels?: MetricLabels): Promise<number> {
    const metric = await this.counter.get();
    if (!metric.values || metric.values.length === 0) {
      return 0;
    }
    // 如果有标签，需要匹配对应的值
    if (labels) {
      const matchingValue = metric.values.find((v: any) => {
        const vLabels = v.labels || {};
        return Object.keys(labels).every(key => vLabels[key] === labels[key]);
      });
      return matchingValue?.value || 0;
    }
    return metric.values[0]?.value || 0;
  }

  reset(): void {
    this.counter.reset();
  }
}

/**
 * Prometheus 仪表盘包装
 */
class PrometheusGaugeWrapper implements IGauge {
  private gauge: Gauge<string>;
  private _name: string;
  private _help: string;
  private _labelNames: readonly string[];

  constructor(gauge: Gauge<string>, name: string, help: string, labelNames: readonly string[] = []) {
    this.gauge = gauge;
    this._name = name;
    this._help = help;
    this._labelNames = labelNames;
  }

  get name(): string {
    return this._name;
  }

  get help(): string {
    return this._help;
  }

  get labelNames(): readonly string[] {
    return this._labelNames;
  }

  set(labels: MetricLabels, value: number): void {
    this.gauge.set(labels, value);
  }

  inc(labels?: MetricLabels, value: number = 1): void {
    if (labels) {
      this.gauge.inc(labels, value);
    } else {
      this.gauge.inc(value);
    }
  }

  dec(labels?: MetricLabels, value: number = 1): void {
    if (labels) {
      this.gauge.dec(labels, value);
    } else {
      this.gauge.dec(value);
    }
  }

  async get(labels?: MetricLabels): Promise<number> {
    const metric = await this.gauge.get();
    if (!metric.values || metric.values.length === 0) {
      return 0;
    }
    // 如果有标签，需要匹配对应的值
    if (labels) {
      const matchingValue = metric.values.find((v: any) => {
        const vLabels = v.labels || {};
        return Object.keys(labels).every(key => vLabels[key] === labels[key]);
      });
      return matchingValue?.value || 0;
    }
    return metric.values[0]?.value || 0;
  }

  reset(): void {
    this.gauge.reset();
  }
}

/**
 * Prometheus 直方图包装
 */
class PrometheusHistogramWrapper implements IHistogram {
  private histogram: Histogram<string>;
  private _name: string;
  private _help: string;
  private _labelNames: readonly string[];

  constructor(histogram: Histogram<string>, name: string, help: string, labelNames: readonly string[] = []) {
    this.histogram = histogram;
    this._name = name;
    this._help = help;
    this._labelNames = labelNames;
  }

  get name(): string {
    return this._name;
  }

  get help(): string {
    return this._help;
  }

  get labelNames(): readonly string[] {
    return this._labelNames;
  }

  observe(labels: MetricLabels, value: number): void {
    this.histogram.observe(labels, value);
  }

  startTimer(labels?: MetricLabels): () => number {
    return this.histogram.startTimer(labels);
  }

  async get(labels?: MetricLabels): Promise<HistogramValue> {
    const metric = await this.histogram.get();
    if (!metric.values || metric.values.length === 0) {
      return {
        sum: 0,
        count: 0,
        buckets: [],
      };
    }
    
    // 如果有标签，需要匹配对应的值
    let value: any;
    if (labels) {
      value = metric.values.find((v: any) => {
        const vLabels = v.labels || {};
        return Object.keys(labels).every(key => vLabels[key] === labels[key]);
      });
    } else {
      value = metric.values[0];
    }
    
    return {
      sum: value?.value || 0,
      count: value?.value || 0,
      buckets: metric.values
        .filter((v: any) => v.le !== undefined)
        .map((v: any) => ({
          le: v.le || '',
          count: v.value || 0,
        })),
    };
  }

  reset(): void {
    this.histogram.reset();
  }
}

/**
 * Prometheus 摘要包装
 */
class PrometheusSummaryWrapper implements ISummary {
  private summary: Summary<string>;
  private _name: string;
  private _help: string;
  private _labelNames: readonly string[];

  constructor(summary: Summary<string>, name: string, help: string, labelNames: readonly string[] = []) {
    this.summary = summary;
    this._name = name;
    this._help = help;
    this._labelNames = labelNames;
  }

  get name(): string {
    return this._name;
  }

  get help(): string {
    return this._help;
  }

  get labelNames(): readonly string[] {
    return this._labelNames;
  }

  observe(labels: MetricLabels, value: number): void {
    this.summary.observe(labels, value);
  }

  startTimer(labels?: MetricLabels): () => number {
    return this.summary.startTimer(labels);
  }

  async get(labels?: MetricLabels): Promise<SummaryValue> {
    const metric = await this.summary.get();
    if (!metric.values || metric.values.length === 0) {
      return {
        sum: 0,
        count: 0,
        quantiles: [],
      };
    }
    
    // 如果有标签，需要匹配对应的值
    let value: any;
    if (labels) {
      value = metric.values.find((v: any) => {
        const vLabels = v.labels || {};
        return Object.keys(labels).every(key => vLabels[key] === labels[key]);
      });
    } else {
      value = metric.values[0];
    }
    
    return {
      sum: value?.value || 0,
      count: value?.value || 0,
      quantiles: metric.values
        .filter((v: any) => v.quantile !== undefined)
        .map((v: any) => ({
          quantile: v.quantile || '',
          value: v.value || 0,
        })),
    };
  }

  reset(): void {
    this.summary.reset();
  }
}

/**
 * Prometheus 适配器实现
 */
export class PrometheusAdapter extends BaseMetricAdapter {
  readonly name = 'prometheus';
  private registry: Registry;
  private metrics: Map<string, Counter<string> | Gauge<string> | Histogram<string> | Summary<string>> = new Map();

  constructor(options: PrometheusAdapterOptions = {}) {
    super();
    this.registry = options.registry || new Registry();

    // 收集默认指标
    if (options.collectDefaultMetrics !== false) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: options.prefix,
        gcDurationBuckets: undefined,
        eventLoopMonitoringPrecision: undefined,
      });
    }
  }

  registerCounter(config: CounterConfig): ICounter {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof Counter) {
        return new PrometheusCounterWrapper(existing, name, config.help, config.labelNames || []);
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const counter = new Counter({
      name,
      help: config.help,
      labelNames: config.labelNames,
      registers: [this.registry],
    });

    this.metrics.set(name, counter);
    return new PrometheusCounterWrapper(counter, name, config.help, config.labelNames || []);
  }

  registerGauge(config: GaugeConfig): IGauge {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof Gauge) {
        return new PrometheusGaugeWrapper(existing, name, config.help, config.labelNames || []);
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const gauge = new Gauge({
      name,
      help: config.help,
      labelNames: config.labelNames,
      registers: [this.registry],
    });

    this.metrics.set(name, gauge);
    return new PrometheusGaugeWrapper(gauge, name, config.help, config.labelNames || []);
  }

  registerHistogram(config: HistogramConfig): IHistogram {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof Histogram) {
        return new PrometheusHistogramWrapper(existing, name, config.help, config.labelNames || []);
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const histogram = new Histogram({
      name,
      help: config.help,
      labelNames: config.labelNames,
      buckets: config.buckets,
      registers: [this.registry],
    });

    this.metrics.set(name, histogram);
    return new PrometheusHistogramWrapper(histogram, name, config.help, config.labelNames || []);
  }

  registerSummary(config: SummaryConfig): ISummary {
    const name = config.name;
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing instanceof Summary) {
        return new PrometheusSummaryWrapper(existing, name, config.help, config.labelNames || []);
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const summary = new Summary({
      name,
      help: config.help,
      labelNames: config.labelNames,
      percentiles: config.percentiles,
      maxAgeSeconds: config.maxAgeSeconds,
      ageBuckets: config.ageBuckets,
      registers: [this.registry],
    });

    this.metrics.set(name, summary);
    return new PrometheusSummaryWrapper(summary, name, config.help, config.labelNames || []);
  }

  async collect(): Promise<AdapterMetrics> {
    const metrics = await this.registry.getMetricsAsJSON();
    
    const result: AdapterMetrics = {
      counters: [],
      gauges: [],
      histograms: [],
      summaries: [],
    };

    for (const metric of metrics) {
      const type = String(metric.type);
      const name = metric.name;

      for (const value of metric.values || []) {
        const labels: MetricLabels = {};
        if (value.labels) {
          for (const [key, val] of Object.entries(value.labels)) {
            if (val !== undefined) {
              labels[key] = typeof val === 'string' || typeof val === 'number' ? val : String(val);
            }
          }
        }
        const metricValue = value.value || 0;

        if (type === 'counter') {
          result.counters.push({ name, labels, value: metricValue });
        } else if (type === 'gauge') {
          result.gauges.push({ name, labels, value: metricValue });
        } else if (type === 'histogram') {
          const histogramValue: any = { value: metricValue };
          const valueAny = value as any;
          if (valueAny.buckets) {
            histogramValue.buckets = valueAny.buckets;
          }
          result.histograms.push({ name, labels, value: histogramValue });
        } else if (type === 'summary') {
          const summaryValue: any = { value: metricValue };
          const valueAny = value as any;
          if (valueAny.quantiles) {
            summaryValue.quantiles = valueAny.quantiles;
          }
          result.summaries.push({ name, labels, value: summaryValue });
        }
      }
    }

    return result;
  }

  async export(format?: string): Promise<string> {
    if (format === 'json') {
      const metrics = await this.registry.getMetricsAsJSON();
      return JSON.stringify(metrics, null, 2);
    }
    // 默认返回 Prometheus 格式
    return this.registry.metrics();
  }

  reset(): void {
    this.registry.resetMetrics();
  }

  /**
   * 获取内部注册表（用于高级用法）
   */
  getRegistry(): Registry {
    return this.registry;
  }
}


