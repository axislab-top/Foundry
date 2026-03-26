/**
 * 日志类型定义
 */

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose'
}

export interface LogContext {
  [key: string]: any;
  service?: string;
  environment?: string;
  requestId?: string;
  userId?: string;
  correlationId?: string;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: Error;
  metadata?: Record<string, any>;
}

export interface LoggerConfig {
  level?: LogLevel;
  service?: string;
  environment?: string;
  defaultContext?: LogContext;
  transports?: TransportConfig[];
}

export interface TransportConfig {
  type: 'console' | 'file' | 'elasticsearch' | 'loki';
  level?: LogLevel;
  options?: Record<string, any>;
}

export interface Logger {
  error(message: string, context?: LogContext, error?: Error): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  verbose(message: string, context?: LogContext): void;
  log(level: LogLevel, message: string, context?: LogContext, error?: Error): void;
}











































