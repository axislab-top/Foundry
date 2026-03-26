import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { createLogger, LogLevel } from '@service/logging';

const logger = createLogger({
  service: 'gateway-service',
  environment: process.env.NODE_ENV || 'development',
  level: LogLevel.INFO,
});

/**
 * 性能监控拦截器
 * 记录请求性能指标
 */
@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const endMemory = process.memoryUsage();
          const memoryDelta = {
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            external: endMemory.external - startMemory.external,
          };

          // 如果请求时间超过1秒，记录警告
          if (duration > 1000) {
            logger.warn('Slow request detected', {
              method,
              url,
              duration,
              memoryDelta,
              timestamp: new Date().toISOString(),
            });
          }

          // 记录性能指标（可选，可以发送到监控系统）
          logger.debug('Performance metrics', {
            method,
            url,
            duration,
            memoryDelta,
            timestamp: new Date().toISOString(),
          });
        },
      }),
      // 使用 catchError 确保异常能够正确传播到异常过滤器
      catchError((error) => {
        const duration = Date.now() - startTime;
        logger.error('Request error performance', {
          method,
          url,
          duration,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        
        // 重新抛出异常，确保异常过滤器能够正确处理
        return throwError(() => error);
      }),
    );
  }
}



