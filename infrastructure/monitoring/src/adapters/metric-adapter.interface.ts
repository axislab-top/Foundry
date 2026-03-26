/**
 * 指标适配器接口
 * 
 * 所有指标适配器必须实现此接口
 */

import { MetricAdapter } from '../types/adapter.types.js';

/**
 * 抽象适配器基类
 * 提供一些通用方法的默认实现
 */
export abstract class BaseMetricAdapter implements MetricAdapter {
  /**
   * 适配器名称
   */
  abstract readonly name: string;

  /**
   * 注册计数器
   */
  abstract registerCounter(config: {
    name: string;
    help: string;
    labelNames?: string[];
  }): import('../types/metric.types.js').Counter;

  /**
   * 注册仪表盘
   */
  abstract registerGauge(config: {
    name: string;
    help: string;
    labelNames?: string[];
  }): import('../types/metric.types.js').Gauge;

  /**
   * 注册直方图
   */
  abstract registerHistogram(config: {
    name: string;
    help: string;
    labelNames?: string[];
    buckets?: number[];
  }): import('../types/metric.types.js').Histogram;

  /**
   * 注册摘要
   */
  abstract registerSummary(config: {
    name: string;
    help: string;
    labelNames?: string[];
    percentiles?: number[];
    maxAgeSeconds?: number;
    ageBuckets?: number;
  }): import('../types/metric.types.js').Summary;

  /**
   * 收集所有指标数据
   */
  abstract collect(): Promise<import('../types/adapter.types.js').AdapterMetrics>;

  /**
   * 导出指标（格式化为字符串）
   */
  abstract export(format?: string): Promise<string>;

  /**
   * 重置所有指标（默认实现为空）
   */
  reset(): void {
    // 子类可以覆盖此方法
  }

  /**
   * 清理资源（默认实现为空）
   */
  async close(): Promise<void> {
    // 子类可以覆盖此方法
  }
}







































