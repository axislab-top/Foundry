import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AuditService } from '../services/audit.service.js';
import type { GatewayRequest } from '../../../common/types/request.types.js';

/**
 * 审计拦截器
 * 记录所有请求的审计日志
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    // 提取服务名（从路径或路由信息）
    const service = this.extractService(request);

    return next.handle().pipe(
      tap((data) => {
        const durationMs = Date.now() - startTime;
        this.auditService.log(request, response, service, durationMs).catch(() => {
          // 忽略错误
        });
      }),
      catchError((error) => {
        const durationMs = Date.now() - startTime;
        this.auditService
          .log(request, response, service, durationMs, error)
          .catch(() => {
            // 忽略错误
          });
        // 使用 throwError 重新抛出错误，确保异常过滤器能够正确处理
        return throwError(() => error);
      }),
    );
  }

  /**
   * 提取服务名
   */
  private extractService(request: GatewayRequest): string {
    const path = request.path || request.url || '';

    if (path.startsWith('/api/v1') || path.startsWith('/api/auth')) {
      return 'api';
    }
    if (path.startsWith('/webhooks')) {
      return 'webhooks';
    }
    if (path.startsWith('/worker')) {
      return 'worker';
    }
    if (path.startsWith('/api/admin')) {
      return 'gateway';
    }

    return 'unknown';
  }
}











