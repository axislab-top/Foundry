/**
 * 指标注册表
 * 
 * 管理所有已注册的指标
 */

import {
  Counter,
  Gauge,
  Histogram,
  Summary,
  Metric,
} from '../types/metric.types.js';

/**
 * 指标注册表
 */
export class MetricsRegistry {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private summaries: Map<string, Summary> = new Map();

  /**
   * 注册计数器
   */
  registerCounter(name: string, counter: Counter): void {
    if (this.counters.has(name)) {
      throw new Error(`Counter ${name} already registered`);
    }
    this.counters.set(name, counter);
  }

  /**
   * 注册仪表盘
   */
  registerGauge(name: string, gauge: Gauge): void {
    if (this.gauges.has(name)) {
      throw new Error(`Gauge ${name} already registered`);
    }
    this.gauges.set(name, gauge);
  }

  /**
   * 注册直方图
   */
  registerHistogram(name: string, histogram: Histogram): void {
    if (this.histograms.has(name)) {
      throw new Error(`Histogram ${name} already registered`);
    }
    this.histograms.set(name, histogram);
  }

  /**
   * 注册摘要
   */
  registerSummary(name: string, summary: Summary): void {
    if (this.summaries.has(name)) {
      throw new Error(`Summary ${name} already registered`);
    }
    this.summaries.set(name, summary);
  }

  /**
   * 获取计数器
   */
  getCounter(name: string): Counter | undefined {
    return this.counters.get(name);
  }

  /**
   * 获取仪表盘
   */
  getGauge(name: string): Gauge | undefined {
    return this.gauges.get(name);
  }

  /**
   * 获取直方图
   */
  getHistogram(name: string): Histogram | undefined {
    return this.histograms.get(name);
  }

  /**
   * 获取摘要
   */
  getSummary(name: string): Summary | undefined {
    return this.summaries.get(name);
  }

  /**
   * 获取指标（自动判断类型）
   */
  getMetric(name: string): Metric | undefined {
    return (
      this.counters.get(name) ||
      this.gauges.get(name) ||
      this.histograms.get(name) ||
      this.summaries.get(name)
    );
  }

  /**
   * 获取所有计数器
   */
  getAllCounters(): Map<string, Counter> {
    return new Map(this.counters);
  }

  /**
   * 获取所有仪表盘
   */
  getAllGauges(): Map<string, Gauge> {
    return new Map(this.gauges);
  }

  /**
   * 获取所有直方图
   */
  getAllHistograms(): Map<string, Histogram> {
    return new Map(this.histograms);
  }

  /**
   * 获取所有摘要
   */
  getAllSummaries(): Map<string, Summary> {
    return new Map(this.summaries);
  }

  /**
   * 获取所有指标
   */
  getAllMetrics(): Map<string, Metric> {
    const all = new Map<string, Metric>();
    for (const [name, metric] of this.counters.entries()) {
      all.set(name, metric);
    }
    for (const [name, metric] of this.gauges.entries()) {
      all.set(name, metric);
    }
    for (const [name, metric] of this.histograms.entries()) {
      all.set(name, metric);
    }
    for (const [name, metric] of this.summaries.entries()) {
      all.set(name, metric);
    }
    return all;
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    for (const metric of this.counters.values()) {
      metric.reset();
    }
    for (const metric of this.gauges.values()) {
      metric.reset();
    }
    for (const metric of this.histograms.values()) {
      metric.reset();
    }
    for (const metric of this.summaries.values()) {
      metric.reset();
    }
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
  }
}







































