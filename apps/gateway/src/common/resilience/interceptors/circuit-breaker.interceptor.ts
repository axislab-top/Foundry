import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Optional,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { CircuitBreakerService } from '../services/circuit-breaker.service.js';
import { ConfigService } from '../../config/config.service.js';
import { GatewayException } from '../../exceptions/filters/gateway-exception.filter.js';
import { ErrorCode } from '../../exceptions/error-codes.js';
import { MonitoringService } from '../../monitoring/monitoring.service.js';

/**
 * 断路器拦截器
 * 在请求执行前检查断路器状态，执行后记录成功/失败
 */
@Injectable()
export class CircuitBreakerInterceptor implements NestInterceptor {
  constructor(
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly monitoringService: MonitoringService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    // 检查是否启用断路器
    const config = this.configService?.getCircuitBreakerConfig();
    if (config && !config.enabled) {
      // 断路器未启用，直接通过
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const serviceName = this.extractServiceName(request);

    if (!serviceName) {
      // 无法确定服务名，直接通过
      return next.handle();
    }

    // 获取当前状态并更新指标
    const stats = await this.circuitBreakerService.getStats(serviceName);
    this.monitoringService.updateCircuitBreakerState(serviceName, stats.state);

    // 检查是否可以执行
    const canExecute = await this.circuitBreakerService.canExecute(serviceName);

    if (!canExecute) {
      // 断路器打开，拒绝请求
      throw new GatewayException(
        ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
        `Service ${serviceName} circuit breaker is open`,
        503,
      );
    }

    // 执行请求
    return next.handle().pipe(
      tap(async () => {
        // 成功：记录成功
        await this.circuitBreakerService.recordSuccess(serviceName).catch(() => {
          // 忽略错误
        });
        this.monitoringService.recordCircuitBreakerSuccess(serviceName);
        
        // 更新状态（可能在recordSuccess后状态改变）
        const updatedStats = await this.circuitBreakerService.getStats(serviceName);
        this.monitoringService.updateCircuitBreakerState(serviceName, updatedStats.state);
      }),
      catchError(async (error) => {
        // 检查错误是否应该被统计（使用错误过滤器）
        const config = this.configService?.getCircuitBreakerConfig();
        const shouldRecordFailure =
          !config?.errorFilter || config.errorFilter(error);

        if (shouldRecordFailure) {
          // 失败：记录失败
          await this.circuitBreakerService.recordFailure(serviceName).catch(() => {
            // 忽略错误
          });
          this.monitoringService.recordCircuitBreakerFailure(serviceName);
        }

        // 检查是否因为失败导致断路器打开
        const updatedStats = await this.circuitBreakerService.getStats(serviceName);
        if (updatedStats.state === 'open' && stats.state !== 'open') {
          // 状态从非打开变为打开，记录打开事件
          this.monitoringService.recordCircuitBreakerOpen(serviceName);
        }
        this.monitoringService.updateCircuitBreakerState(serviceName, updatedStats.state);

        return throwError(() => error);
      }),
    );
  }

  /**
   * 提取服务名（从请求路径或路由信息）
   */
  private extractServiceName(request: any): string | null {
    // 尝试从路由信息获取
    const route = request.route || (request as any).routeConfig;
    if (route?.service) {
      return route.service;
    }

    // 从路径推断
    const path = request.path || request.url;
    if (path?.startsWith('/api/v1') || path?.startsWith('/api/auth')) {
      return 'api';
    }
    if (path?.startsWith('/webhooks')) {
      return 'webhooks';
    }
    if (path?.startsWith('/worker')) {
      return 'worker';
    }

    return null;
  }
}


