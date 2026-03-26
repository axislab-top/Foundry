/**
 * 结构化日志服务
 * 
 * 提供统一的日志记录接口，支持多种传输方式
 */

import winston from 'winston';
import { Logger, LoggerConfig, LogLevel, LogContext, TransportConfig } from './types.js';
import { createTransport, TransportInstance } from './transports/transport-factory.js';
import { createConsoleTransport } from './transports/console.transport.js';

/**
 * 结构化日志服务实现
 */
export class StructuredLoggerService implements Logger {
  private logger: winston.Logger;
  private config: Required<LoggerConfig>;

  constructor(config: LoggerConfig = {}) {
    this.config = {
      level: config.level || LogLevel.INFO,
      service: config.service || process.env.SERVICE_NAME || 'unknown',
      environment: config.environment || process.env.NODE_ENV || 'development',
      defaultContext: config.defaultContext || {},
      transports: config.transports || []
    };

    // 如果没有提供传输器，默认使用控制台传输器
    const transports: TransportInstance[] = this.config.transports.length > 0
      ? this.config.transports.map(createTransport)
      : [createConsoleTransport({ level: this.config.level })];

    this.logger = winston.createLogger({
      level: this.config.level,
      defaultMeta: {
        service: this.config.service,
        environment: this.config.environment,
        ...this.config.defaultContext
      },
      transports
    });
  }

  /**
   * 记录错误日志
   */
  error(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * 记录警告日志
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * 记录信息日志
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * 记录调试日志
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * 记录详细日志
   */
  verbose(message: string, context?: LogContext): void {
    this.log(LogLevel.VERBOSE, message, context);
  }

  /**
   * 通用日志记录方法
   */
  log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const metadata: Record<string, any> = {
      ...this.config.defaultContext,
      ...context
    };

    if (error) {
      metadata.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    this.logger.log({
      level,
      message,
      context: metadata,
      metadata,
      error
    });
  }

  /**
   * 创建子日志器（继承默认上下文）
   */
  child(defaultContext: LogContext): Logger {
    const childConfig: LoggerConfig = {
      ...this.config,
      defaultContext: {
        ...this.config.defaultContext,
        ...defaultContext
      }
    };

    return new StructuredLoggerService(childConfig);
  }

  /**
   * 获取 Winston 日志器实例（用于高级用法）
   */
  getWinstonLogger(): winston.Logger {
    return this.logger;
  }
}

/**
 * 创建日志器实例的便捷函数
 */
export function createLogger(config?: LoggerConfig): Logger {
  return new StructuredLoggerService(config);
}

/**
 * 默认日志器实例
 */
export const logger = createLogger();




