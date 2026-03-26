/**
 * 指标类型定义
 */

/**
 * 指标值类型
 */
export type MetricValue = number | string;

/**
 * 指标标签（键值对）
 */
export interface MetricLabels {
  [key: string]: string | number;
}

/**
 * 指标接口
 */
export interface Metric {
  /**
   * 指标名称
   */
  readonly name: string;

  /**
   * 指标帮助文本
   */
  readonly help: string;

  /**
   * 标签键列表
   */
  readonly labelNames: readonly string[];

  /**
   * 重置指标
   */
  reset(): void;
}

/**
 * 计数器指标接口
 */
export interface Counter extends Metric {
  /**
   * 增加计数器值
   */
  inc(labels?: MetricLabels, value?: number): void;
  
  /**
   * 获取当前值
   */
  get(labels?: MetricLabels): number | Promise<number>;
}

/**
 * 仪表盘指标接口
 */
export interface Gauge extends Metric {
  /**
   * 设置值
   */
  set(labels: MetricLabels, value: number): void;
  
  /**
   * 增加值
   */
  inc(labels?: MetricLabels, value?: number): void;
  
  /**
   * 减少值
   */
  dec(labels?: MetricLabels, value?: number): void;
  
  /**
   * 获取当前值
   */
  get(labels?: MetricLabels): number | Promise<number>;
}

/**
 * 直方图指标接口
 */
export interface Histogram extends Metric {
  /**
   * 观察一个值
   */
  observe(labels: MetricLabels, value: number): void;
  
  /**
   * 启动计时器
   */
  startTimer(labels?: MetricLabels): () => number;
  
  /**
   * 获取统计信息
   */
  get(labels?: MetricLabels): HistogramValue | Promise<HistogramValue>;
}

/**
 * 摘要指标接口（类似直方图）
 */
export interface Summary extends Metric {
  /**
   * 观察一个值
   */
  observe(labels: MetricLabels, value: number): void;
  
  /**
   * 启动计时器
   */
  startTimer(labels?: MetricLabels): () => number;
  
  /**
   * 获取统计信息
   */
  get(labels?: MetricLabels): SummaryValue | Promise<SummaryValue>;
}

/**
 * 直方图值
 */
export interface HistogramValue {
  sum: number;
  count: number;
  buckets: Array<{ le: string; count: number }>;
}

/**
 * 摘要值
 */
export interface SummaryValue {
  sum: number;
  count: number;
  quantiles: Array<{ quantile: string; value: number }>;
}


