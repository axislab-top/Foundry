import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { CircuitBreakerService } from '../../../common/resilience/services/circuit-breaker.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { GatewayException } from '../../../common/exceptions/filters/gateway-exception.filter.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';

/**
 * 断路器守卫
 * 可以在特定路由上使用，提供更细粒度的断路器控制
 * 
 * 使用示例:
 * @UseGuards(CircuitBreakerGuard)
 * @Get('/api/v1/users')
 */
@Injectable()
export class CircuitBreakerGuard implements CanActivate {
  constructor(
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 检查是否启用断路器
    const config = this.configService.getCircuitBreakerConfig();
    if (!config.enabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const serviceName = this.extractServiceName(request);

    if (!serviceName) {
      // 无法确定服务名，允许通过
      return true;
    }

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

    return true;
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








