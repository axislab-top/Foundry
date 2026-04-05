import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { createLogger, LogLevel } from '@service/logging';

const logger = createLogger({
  service: 'api-service',
  environment: process.env.NODE_ENV || 'development',
  level: LogLevel.INFO,
});

/**
 * 日志中间件
 * 记录请求基本信息
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, url, ip } = req;
    const requestId = req.headers['x-request-id'] as string;
    const runId = req.headers['x-run-id'] as string;
    const traceId = req.headers['x-trace-id'] as string;
    const spanId = req.headers['x-span-id'] as string;

    logger.info('Request received', {
      method,
      url,
      ip,
      requestId,
      runId,
      traceId,
      spanId,
      timestamp: new Date().toISOString(),
    });

    // 记录响应完成
    res.on('finish', () => {
      logger.info('Request completed', {
        method,
        url,
        ip,
        requestId,
        runId,
        traceId,
        spanId,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
      });
    });

    next();
  }
}





























