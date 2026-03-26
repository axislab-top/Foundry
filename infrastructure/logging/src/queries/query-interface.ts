/**
 * 日志查询接口
 */

import { LogEntry, LogLevel } from '../types.js';

export interface LogQuery {
  level?: LogLevel | LogLevel[];
  service?: string | string[];
  message?: string;
  messageRegex?: RegExp;
  context?: Record<string, any>;
  timeRange?: {
    start: Date | string;
    end: Date | string;
  };
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  entries: LogEntry[];
  total: number;
  hasMore: boolean;
}

export interface LogQueryEngine {
  /**
   * 查询日志
   */
  query(query: LogQuery): QueryResult;

  /**
   * 添加日志条目到查询引擎
   */
  add(entry: LogEntry): void;

  /**
   * 清空所有日志
   */
  clear(): void;
}




