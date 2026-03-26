/**
 * 日志库使用示例
 * 
 * 此文件展示了如何使用 @service/logging 日志库
 */

import { createLogger, LogLevel, TransportConfig } from './index.js';

// 示例 1: 基础使用
const basicLogger = createLogger({
  service: 'my-service',
  level: LogLevel.INFO
});

basicLogger.info('Application started');
basicLogger.error('An error occurred', { userId: '123' }, new Error('Test error'));

// 示例 2: 使用多个传输器
const transports: TransportConfig[] = [
  {
    type: 'console',
    level: LogLevel.DEBUG
  },
  {
    type: 'file',
    level: LogLevel.INFO,
    options: {
      filename: 'app.log',
      dirname: './logs'
    }
  },
  {
    type: 'loki',
    level: LogLevel.INFO,
    options: {
      host: process.env.LOKI_URL || 'http://localhost:3100',
      labels: {
        job: 'my-service'
      }
    }
  }
];

const advancedLogger = createLogger({
  service: 'my-service',
  environment: 'production',
  level: LogLevel.INFO,
  transports,
  defaultContext: {
    version: '1.0.0'
  }
});

advancedLogger.info('User logged in', { userId: '123', ip: '192.168.1.1' });

// 示例 3: 创建子日志器
const requestLogger = advancedLogger.child({
  requestId: 'abc-123'
});

requestLogger.info('Processing request');
requestLogger.error('Request failed', {}, new Error('Processing error'));

// 示例 4: 不同日志级别
advancedLogger.error('Error message', { error: 'details' });
advancedLogger.warn('Warning message', { action: 'retry' });
advancedLogger.info('Info message', { status: 'ok' });
advancedLogger.debug('Debug message', { data: 'value' });
advancedLogger.verbose('Verbose message', { trace: 'details' });




