/**
 * 日志聚合器接口
 */

import { LogEntry } from '../types.js';

export interface LogAggregator {
  /**
   * 添加日志条目到聚合器
   */
  add(entry: LogEntry): void;

  /**
   * 获取聚合后的日志数据
   */
  getAggregated(): AggregatedLogData;

  /**
   * 清空聚合器
   */
  clear(): void;

  /**
   * 获取统计信息
   */
  getStats(): AggregatorStats;
}

export interface AggregatedLogData {
  entries: LogEntry[];
  summary: {
    total: number;
    byLevel: Record<string, number>;
    byService?: Record<string, number>;
    timeRange: {
      start: string;
      end: string;
    };
  };
}

export interface AggregatorStats {
  totalEntries: number;
  entriesByLevel: Record<string, number>;
  entriesByService?: Record<string, number>;
  oldestEntry?: string;
  newestEntry?: string;
}




