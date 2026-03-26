/**
 * 性能追踪装饰器
 * 
 * 用于追踪函数执行性能
 */

import { MetricsManager } from '../infrastructure/metrics-manager.js';
import { Histogram } from '../types/metric.types.js';
import { MetricLabels } from '../types/metric.types.js';

/**
 * TrackPerformance 装饰器选项
 */
export interface TrackPerformanceOptions {
  /**
   * 指标名称
   */
  name?: string;

  /**
   * 帮助文本
   */
  help?: string;

  /**
   * 标签
   */
  labels?: MetricLabels;

  /**
   * 直方图桶
   */
  buckets?: number[];
}

/**
 * 性能追踪装饰器
 * 
 * 自动记录函数执行时间
 * 
 * @example
 * ```typescript
 * class MyService {
 *   @TrackPerformance({ name: 'my_method_duration_seconds' })
 *   async myMethod() {
 *     // ...
 *   }
 * }
 * ```
 */
export function TrackPerformance(options: TrackPerformanceOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const metricName = options.name || `${propertyKey}_duration_seconds`;
    const help = options.help || `Duration of ${propertyKey} in seconds`;
    const labels = options.labels || {};
    const buckets = options.buckets;

    let histogram: Histogram | undefined;

    descriptor.value = async function (...args: any[]) {
      // 延迟初始化指标
      if (!histogram) {
        try {
          const metricsManager = MetricsManager.getInstance();
          histogram = metricsManager.getHistogram(metricName) || metricsManager.registerHistogram({
            name: metricName,
            help,
            labelNames: Object.keys(labels),
            buckets,
          });
        } catch (error) {
          console.warn('MetricsManager not initialized, track performance decorator will not collect metrics');
        }
      }

      // 记录执行时间
      const timer = histogram?.startTimer(labels);
      try {
        const result = await originalMethod.apply(this, args);
        timer?.();
        return result;
      } catch (error) {
        timer?.();
        throw error;
      }
    };

    return descriptor;
  };
}







































