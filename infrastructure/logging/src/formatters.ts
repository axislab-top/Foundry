/**
 * 日志格式化器
 */

import { LogEntry, LogLevel } from './types.js';

/**
 * JSON 格式化器 - 输出结构化 JSON 日志
 */
export function jsonFormatter(entry: LogEntry): string {
  const logObject = {
    timestamp: entry.timestamp,
    level: entry.level.toUpperCase(),
    message: entry.message,
    ...entry.context,
    ...entry.metadata
  };

  if (entry.error && entry.error instanceof Error) {
    (logObject as any).error = {
      name: entry.error.name,
      message: entry.error.message,
      stack: entry.error.stack
    };
  }

  return JSON.stringify(logObject);
}

/**
 * 简洁格式化器 - 用于控制台输出
 */
export function simpleFormatter(entry: LogEntry): string {
  const timestamp = new Date(entry.timestamp).toISOString();
  const level = entry.level.toUpperCase().padEnd(5);
  const contextStr = entry.context
    ? Object.entries(entry.context)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')
    : '';
  
  let message = `${timestamp} [${level}] ${entry.message}`;
  
  if (contextStr) {
    message += ` ${contextStr}`;
  }
  
  if (entry.error) {
    message += `\n${entry.error.stack}`;
  }
  
  return message;
}

/**
 * 彩色格式化器 - 用于开发环境控制台
 */
export function colorFormatter(entry: LogEntry): string {
  const colors: Record<LogLevel, string> = {
    [LogLevel.ERROR]: '\x1b[31m',   // Red
    [LogLevel.WARN]: '\x1b[33m',    // Yellow
    [LogLevel.INFO]: '\x1b[36m',    // Cyan
    [LogLevel.DEBUG]: '\x1b[35m',   // Magenta
    [LogLevel.VERBOSE]: '\x1b[90m'  // Gray
  };
  
  const reset = '\x1b[0m';
  const color = colors[entry.level] || reset;
  
  return `${color}${simpleFormatter(entry)}${reset}`;
}
