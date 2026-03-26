/**
 * 指标装饰器
 * 
 * 用于自动收集函数调用指标
 */

import { MetricsManager } from '../infrastructure/metrics-manager.js';
import { Counter, Histogram } from '../types/metric.types.js';
import { MetricLabels } from '../types/metric.types.js';

/**
 * Metrics 装饰器选项
 */
export interface MetricsOptions {
  /**
   * 指标名称前缀
   */
  prefix?: string;

  /**
   * 计数器名称（用于计数调用次数）
   */
  counterName?: string;

  /**
   * 直方图名称（用于记录执行时间）
   */
  histogramName?: string;

  /**
   * 标签
   */
  labels?: MetricLabels;
}

/**
 * 指标装饰器
 * 
 * 自动收集函数调用次数和执行时间
 * 
 * @example
 * ```typescript
 * class MyService {
 *   @Metrics({ counterName: 'my_service_calls_total', histogramName: 'my_service_duration_seconds' })
 *   async myMethod() {
 *     // ...
 *   }
 * }
 * ```
 */
export function Metrics(options: MetricsOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const prefix = options.prefix || '';
    const counterName = options.counterName || `${prefix}${propertyKey}_calls_total`;
    const histogramName = options.histogramName || `${prefix}${propertyKey}_duration_seconds`;
    const labels = options.labels || {};

    let counter: Counter | undefined;
    let histogram: Histogram | undefined;

    descriptor.value = async function (...args: any[]) {
      // 延迟初始化指标（避免在模块加载时初始化）
      if (!counter || !histogram) {
        try {
          const metricsManager = MetricsManager.getInstance();
          counter = metricsManager.getCounter(counterName) || metricsManager.registerCounter({
            name: counterName,
            help: `Total number of calls to ${propertyKey}`,
            labelNames: Object.keys(labels),
          });

          histogram = metricsManager.getHistogram(histogramName) || metricsManager.registerHistogram({
            name: histogramName,
            help: `Duration of calls to ${propertyKey} in seconds`,
            labelNames: Object.keys(labels),
          });
        } catch (error) {
          console.warn('MetricsManager not initialized, metrics decorator will not collect metrics');
        }
      }

      // 增加计数器
      if (counter) {
        counter.inc(labels);
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







































