/**
 * 配置类型定义
 */

import { MetricAdapterType } from './adapter.types.js';
import {
  PrometheusAdapterOptions,
  StatsDAdapterOptions,
  ConsoleAdapterOptions,
} from '../adapters/index.js';

/**
 * Prometheus 适配器配置
 */
export interface PrometheusAdapterConfig {
  adapter: MetricAdapterType.PROMETHEUS;
  options?: PrometheusAdapterOptions;
}

/**
 * StatsD 适配器配置
 */
export interface StatsDAdapterConfig {
  adapter: MetricAdapterType.STATSD;
  options?: StatsDAdapterOptions;
}

/**
 * Console 适配器配置
 */
export interface ConsoleAdapterConfig {
  adapter: MetricAdapterType.CONSOLE;
  options?: ConsoleAdapterOptions;
}

/**
 * NoOp 适配器配置
 */
export interface NoOpAdapterConfig {
  adapter: MetricAdapterType.NOOP;
  options?: Record<string, any>;
}

/**
 * 适配器配置联合类型
 */
export type AdapterConfig =
  | PrometheusAdapterConfig
  | StatsDAdapterConfig
  | ConsoleAdapterConfig
  | NoOpAdapterConfig;

/**
 * 指标管理器配置
 */
export interface MetricsManagerConfig {
  /**
   * 默认适配器类型
   */
  defaultAdapter?: MetricAdapterType;

  /**
   * 适配器配置列表
   */
  adapters?: AdapterConfig[];

  /**
   * 是否启用默认收集器
   */
  enableDefaultCollectors?: boolean;

  /**
   * 收集间隔（毫秒）
   */
  collectInterval?: number;
}

