/**
 * 控制台传输器
 */

import winston from 'winston';
import { TransportConfig } from '../types.js';
import { colorFormatter, simpleFormatter } from '../formatters.js';
import { LogEntry } from '../types.js';

export type ConsoleTransport = winston.transports.ConsoleTransportInstance;

/**
 * 创建控制台传输器
 */
export function createConsoleTransport(options: {
  level?: string;
  colorize?: boolean;
  json?: boolean;
} = {}): ConsoleTransport {
  const { level, colorize = true, json = false } = options;

  return new winston.transports.Console({
    // winston transport typings 在不同版本间差异较大，这里用 runtime 支持的字段即可
    level: level || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf((info: any) => {
        const entry: LogEntry = {
          level: info.level as any,
          message: String(info.message || ''),
          timestamp: String(info.timestamp || new Date().toISOString()),
          context: info.context as any,
          error: info.error as Error | undefined,
          metadata: info.metadata as Record<string, any> | undefined
        };

        if (json) {
          // 如果需要 JSON 格式，可以使用 winston 的 json 格式化器
          return JSON.stringify({
            timestamp: entry.timestamp,
            level: entry.level,
            message: entry.message,
            ...entry.context,
            ...entry.metadata,
            ...(entry.error && {
              error: {
                name: entry.error.name,
                message: entry.error.message,
                stack: entry.error.stack
              }
            })
          });
        }

        return colorize ? colorFormatter(entry) : simpleFormatter(entry);
      })
    )
  } as any);
}




