/**
 * 指标中间件
 * 
 * HTTP 请求指标收集中间件（可用于 Express、Fastify 等）
 */

import { MetricsManager } from '../infrastructure/metrics-manager.js';
import { Counter, Histogram } from '../types/metric.types.js';

/**
 * HTTP 指标中间件选项
 */
export interface MetricsMiddlewareOptions {
  /**
   * 请求计数器名称
   */
  requestCounterName?: string;

  /**
   * 响应时间直方图名称
   */
  responseTimeHistogramName?: string;

  /**
   * 请求大小直方图名称
   */
  requestSizeHistogramName?: string;

  /**
   * 响应大小直方图名称
   */
  responseSizeHistogramName?: string;

  /**
   * 是否跳过某些路径
   */
  skip?: (path: string) => boolean;
}

/**
 * 创建 HTTP 指标中间件（Express 风格）
 */
export function createMetricsMiddleware(options: MetricsMiddlewareOptions = {}) {
  const requestCounterName = options.requestCounterName || 'http_requests_total';
  const responseTimeHistogramName = options.responseTimeHistogramName || 'http_request_duration_seconds';
  const skip = options.skip || (() => false);

  let requestCounter: Counter | undefined;
  let responseTimeHistogram: Histogram | undefined;

  return (req: any, res: any, next: any) => {
    // 跳过某些路径
    if (skip(req.path || req.url)) {
      return next();
    }

    // 延迟初始化指标
    if (!requestCounter || !responseTimeHistogram) {
      try {
        const metricsManager = MetricsManager.getInstance();
        requestCounter = metricsManager.getCounter(requestCounterName) || metricsManager.registerCounter({
          name: requestCounterName,
          help: 'Total number of HTTP requests',
          labelNames: ['method', 'status', 'path'],
        });

        responseTimeHistogram = metricsManager.getHistogram(responseTimeHistogramName) || metricsManager.registerHistogram({
          name: responseTimeHistogramName,
          help: 'HTTP request duration in seconds',
          labelNames: ['method', 'status', 'path'],
        });
      } catch (error) {
        console.warn('MetricsManager not initialized, metrics middleware will not collect metrics');
        return next();
      }
    }

    const startTime = Date.now();
    const method = req.method || 'UNKNOWN';
    const path = req.route?.path || req.path || req.url || 'unknown';

    // 监听响应完成
    res.on('finish', () => {
      const status = res.statusCode || 0;
      const duration = (Date.now() - startTime) / 1000;

      const labels = {
        method,
        status: String(status),
        path: path.replace(/\/:[^/]+/g, '/:param'), // 规范化路径参数
      };

      requestCounter?.inc(labels);
      responseTimeHistogram?.observe(labels, duration);
    });

    next();
  };
}

/**
 * 性能追踪器（通用）
 */
export class PerformanceTracker {
  private histogram?: Histogram;
  private metricName: string;

  constructor(metricName: string, help?: string, labelNames?: string[]) {
    this.metricName = metricName;
    
    try {
      const metricsManager = MetricsManager.getInstance();
      this.histogram = metricsManager.getHistogram(metricName) || metricsManager.registerHistogram({
        name: metricName,
        help: help || `Duration of ${metricName} in seconds`,
        labelNames: labelNames || [],
      });
    } catch (error) {
      console.warn('MetricsManager not initialized, PerformanceTracker will not collect metrics');
    }
  }

  /**
   * 开始追踪
   */
  start(labels?: Record<string, string | number>): () => number {
    return this.histogram?.startTimer(labels) || (() => 0);
  }

  /**
   * 记录值
   */
  observe(value: number, labels?: Record<string, string | number>): void {
    this.histogram?.observe(labels || {}, value);
  }
}







































