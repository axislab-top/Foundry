import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { createLogger, LogLevel } from '@service/logging';

const logger = createLogger({
  service: 'api-service',
  environment: process.env.NODE_ENV || 'development',
  level: LogLevel.INFO,
});

/**
 * 日志拦截器
 * 记录所有请求和响应
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
    const requestId = request.headers['x-request-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;
    const spanId = request.headers['x-span-id'] as string;
    const startTime = Date.now();

    logger.info('Incoming request', {
      method,
      url,
      ip,
      requestId,
      traceId,
      spanId,
      timestamp: new Date().toISOString(),
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          logger.info('Request completed', {
            method,
            url,
            ip,
            requestId,
            traceId,
            spanId,
            statusCode: context.switchToHttp().getResponse().statusCode,
            duration,
            timestamp: new Date().toISOString(),
          });
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          logger.error('Request failed', {
            method,
            url,
            ip,
            requestId,
            traceId,
            spanId,
            error: error.message,
            statusCode: error.status || 500,
            duration,
            timestamp: new Date().toISOString(),
          });
        },
      }),
    );
  }
}





























