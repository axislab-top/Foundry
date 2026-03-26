/**
 * 指标配置工具
 */

import { MetricsManagerConfig, AdapterConfig } from '../types/config.types.js';
import { MetricAdapterType } from '../types/adapter.types.js';

/**
 * 从环境变量创建 Prometheus 适配器配置
 */
export function createPrometheusConfigFromEnv(): AdapterConfig {
  return {
    adapter: MetricAdapterType.PROMETHEUS,
    options: {
      collectDefaultMetrics: process.env.PROMETHEUS_COLLECT_DEFAULT_METRICS !== 'false',
      prefix: process.env.PROMETHEUS_PREFIX,
    },
  };
}

/**
 * 从环境变量创建 StatsD 适配器配置
 */
export function createStatsDConfigFromEnv(): AdapterConfig {
  return {
    adapter: MetricAdapterType.STATSD,
    options: {
      host: process.env.STATSD_HOST || 'localhost',
      port: parseInt(process.env.STATSD_PORT || '8125', 10),
      prefix: process.env.STATSD_PREFIX,
      sampleRate: parseFloat(process.env.STATSD_SAMPLE_RATE || '1'),
    },
  };
}

/**
 * 从环境变量创建默认配置
 */
export function createMetricsConfigFromEnv(): MetricsManagerConfig {
  const adapterType = (process.env.METRICS_ADAPTER as MetricAdapterType) || MetricAdapterType.PROMETHEUS;
  
  const adapters: AdapterConfig[] = [];
  
  if (adapterType === MetricAdapterType.PROMETHEUS) {
    adapters.push(createPrometheusConfigFromEnv());
  } else if (adapterType === MetricAdapterType.STATSD) {
    adapters.push(createStatsDConfigFromEnv());
  } else if (adapterType === MetricAdapterType.CONSOLE) {
    adapters.push({ adapter: MetricAdapterType.CONSOLE });
  } else {
    adapters.push({ adapter: MetricAdapterType.NOOP });
  }

  return {
    defaultAdapter: adapterType,
    adapters,
    enableDefaultCollectors: process.env.METRICS_ENABLE_DEFAULT_COLLECTORS !== 'false',
    collectInterval: process.env.METRICS_COLLECT_INTERVAL
      ? parseInt(process.env.METRICS_COLLECT_INTERVAL, 10)
      : undefined,
  };
}







































