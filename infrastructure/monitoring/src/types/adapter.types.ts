/**
 * 适配器类型定义
 */

import {
  Counter,
  Gauge,
  Histogram,
  Summary,
  MetricLabels,
} from './metric.types.js';

/**
 * 指标适配器类型
 */
export enum MetricAdapterType {
  PROMETHEUS = 'prometheus',
  STATSD = 'statsd',
  CONSOLE = 'console',
  NOOP = 'noop',
}

/**
 * 计数器配置
 */
export interface CounterConfig {
  name: string;
  help: string;
  labelNames?: string[];
}

/**
 * 仪表盘配置
 */
export interface GaugeConfig {
  name: string;
  help: string;
  labelNames?: string[];
}

/**
 * 直方图配置
 */
export interface HistogramConfig {
  name: string;
  help: string;
  labelNames?: string[];
  buckets?: number[];
}

/**
 * 摘要配置
 */
export interface SummaryConfig {
  name: string;
  help: string;
  labelNames?: string[];
  percentiles?: number[];
  maxAgeSeconds?: number;
  ageBuckets?: number;
}

/**
 * 适配器指标数据
 */
export interface AdapterMetrics {
  counters: Array<{ name: string; labels: MetricLabels; value: number }>;
  gauges: Array<{ name: string; labels: MetricLabels; value: number }>;
  histograms: Array<{ name: string; labels: MetricLabels; value: any }>;
  summaries: Array<{ name: string; labels: MetricLabels; value: any }>;
}

/**
 * 指标适配器接口
 */
export interface MetricAdapter {
  /**
   * 适配器名称
   */
  readonly name: string;

  /**
   * 注册计数器
   */
  registerCounter(config: CounterConfig): Counter;

  /**
   * 注册仪表盘
   */
  registerGauge(config: GaugeConfig): Gauge;

  /**
   * 注册直方图
   */
  registerHistogram(config: HistogramConfig): Histogram;

  /**
   * 注册摘要
   */
  registerSummary(config: SummaryConfig): Summary;

  /**
   * 收集所有指标数据
   */
  collect(): Promise<AdapterMetrics>;

  /**
   * 导出指标（格式化为字符串）
   */
  export(format?: string): Promise<string>;

  /**
   * 重置所有指标
   */
  reset(): void;

  /**
   * 清理资源
   */
  close(): Promise<void>;
}







































