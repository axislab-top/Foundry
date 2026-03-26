/**
 * 收集器接口
 */

import { MetricsManager } from '../infrastructure/metrics-manager.js';

/**
 * 指标收集器接口
 */
export interface Collector {
  /**
   * 收集器名称
   */
  readonly name: string;

  /**
   * 初始化收集器
   */
  initialize(metricsManager: MetricsManager): void;

  /**
   * 开始收集指标
   */
  start(): void;

  /**
   * 停止收集指标
   */
  stop(): void;

  /**
   * 收集一次指标
   */
  collect(): Promise<void>;
}







































