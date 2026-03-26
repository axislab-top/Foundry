/**
 * NoOp 适配器
 * 
 * 空实现，用于测试或禁用监控
 */

import { BaseMetricAdapter } from './metric-adapter.interface.js';
import {
  Counter,
  Gauge,
  Histogram,
  Summary,
  HistogramValue,
  SummaryValue,
} from '../types/metric.types.js';
import {
  CounterConfig,
  GaugeConfig,
  HistogramConfig,
  SummaryConfig,
  AdapterMetrics,
} from '../types/adapter.types.js';

/**
 * NoOp 指标实现（所有操作都是空操作）
 */
class NoOpMetric {
  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = []
  ) {}

  reset(): void {
    // 空操作
  }
}

class NoOpCounter extends NoOpMetric implements Counter {
  inc(): void {}
  get(): number {
    return 0;
  }
}

class NoOpGauge extends NoOpMetric implements Gauge {
  set(): void {}
  inc(): void {}
  dec(): void {}
  get(): number {
    return 0;
  }
}

class NoOpHistogram extends NoOpMetric implements Histogram {
  observe(): void {}
  startTimer(): () => number {
    return () => 0;
  }
  get(): HistogramValue {
    return { sum: 0, count: 0, buckets: [] };
  }
}

class NoOpSummary extends NoOpMetric implements Summary {
  observe(): void {}
  startTimer(): () => number {
    return () => 0;
  }
  get(): SummaryValue {
    return { sum: 0, count: 0, quantiles: [] };
  }
}

/**
 * NoOp 适配器实现
 */
export class NoOpAdapter extends BaseMetricAdapter {
  readonly name = 'noop';

  registerCounter(config: CounterConfig): Counter {
    return new NoOpCounter(config.name, config.help, config.labelNames);
  }

  registerGauge(config: GaugeConfig): Gauge {
    return new NoOpGauge(config.name, config.help, config.labelNames);
  }

  registerHistogram(config: HistogramConfig): Histogram {
    return new NoOpHistogram(config.name, config.help, config.labelNames);
  }

  registerSummary(config: SummaryConfig): Summary {
    return new NoOpSummary(config.name, config.help, config.labelNames);
  }

  async collect(): Promise<AdapterMetrics> {
    return {
      counters: [],
      gauges: [],
      histograms: [],
      summaries: [],
    };
  }

  async export(): Promise<string> {
    return '';
  }

  reset(): void {
    // 空操作
  }
}







































