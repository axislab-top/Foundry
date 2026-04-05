import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { ConfigService } from '../config/config.service.js';

/**
 * 超时拦截器
 * 设置请求超时时间
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpConfig = this.configService.getHttpConfig();
    const httpMs = httpConfig.timeout || 30000;
    // 与 RoutingService 中 RPC 超时下限一致，避免「下游 RPC 仍可调 60s」但入口 HTTP 30s 先 408
    const timeoutMs = Math.max(httpMs, this.configService.getApiRpcMinTimeoutMs());

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () => new RequestTimeoutException('Request timeout'),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}









































