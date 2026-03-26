/**
 * 日志聚合器实现
 */

import { LogAggregator, AggregatedLogData, AggregatorStats } from './aggregator-interface.js';
import { LogEntry, LogLevel } from '../types.js';

export class LogAggregatorImpl implements LogAggregator {
  private entries: LogEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  add(entry: LogEntry): void {
    this.entries.push(entry);

    // 如果超过最大条目数，删除最旧的条目
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  getAggregated(): AggregatedLogData {
    const byLevel: Record<string, number> = {};
    const byService: Record<string, number> = {};
    
    let startTime: string | undefined;
    let endTime: string | undefined;

    for (const entry of this.entries) {
      // 统计日志级别
      byLevel[entry.level] = (byLevel[entry.level] || 0) + 1;

      // 统计服务
      if (entry.context?.service) {
        byService[entry.context.service] = (byService[entry.context.service] || 0) + 1;
      }

      // 确定时间范围
      if (!startTime || entry.timestamp < startTime) {
        startTime = entry.timestamp;
      }
      if (!endTime || entry.timestamp > endTime) {
        endTime = entry.timestamp;
      }
    }

    return {
      entries: [...this.entries],
      summary: {
        total: this.entries.length,
        byLevel,
        byService: Object.keys(byService).length > 0 ? byService : undefined,
        timeRange: {
          start: startTime || new Date().toISOString(),
          end: endTime || new Date().toISOString()
        }
      }
    };
  }

  clear(): void {
    this.entries = [];
  }

  getStats(): AggregatorStats {
    const entriesByLevel: Record<string, number> = {};
    const entriesByService: Record<string, number> = {};
    
    let oldestEntry: string | undefined;
    let newestEntry: string | undefined;

    for (const entry of this.entries) {
      entriesByLevel[entry.level] = (entriesByLevel[entry.level] || 0) + 1;

      if (entry.context?.service) {
        entriesByService[entry.context.service] = (entriesByService[entry.context.service] || 0) + 1;
      }

      if (!oldestEntry || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
      if (!newestEntry || entry.timestamp > newestEntry) {
        newestEntry = entry.timestamp;
      }
    }

    return {
      totalEntries: this.entries.length,
      entriesByLevel,
      entriesByService: Object.keys(entriesByService).length > 0 ? entriesByService : undefined,
      oldestEntry,
      newestEntry
    };
  }
}




