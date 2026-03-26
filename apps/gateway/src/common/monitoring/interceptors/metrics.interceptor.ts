import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { MonitoringService } from '../monitoring.service.js';

/**
 * Metrics拦截器
 * 记录请求量、延迟、错误率等指标
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly monitoringService: MonitoringService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, path } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        // 记录成功的请求
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode || 200;
        this.monitoringService.recordRequest(method, path, statusCode, duration);
      }),
      catchError((error) => {
        // 记录失败的请求
        const duration = Date.now() - startTime;
        const statusCode = error.status || (error instanceof HttpException ? error.getStatus() : 500);
        this.monitoringService.recordRequest(method, path, statusCode, duration);
        // 使用 throwError 重新抛出错误，确保异常过滤器能够正确处理
        return throwError(() => error);
      }),
    );
  }
}































