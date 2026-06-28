import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitingService } from '../rate-limiting.service.js';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../../../common/decorators/rate-limit.decorator.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { GatewayException } from '../../../common/exceptions/filters/gateway-exception.filter.js';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';

/**
 * 限流守卫
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitingService: RateLimitingService,
    private readonly reflector: Reflector,
    private readonly monitoringService: MonitoringService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();

    // 获取限流配置
    const rateLimitOptions = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [handler, context.getClass()],
    );

    if (!rateLimitOptions) {
      return true; // 没有限流配置，允许通过
    }

    if (this.shouldBypassRateLimitForE2EAutomation(request)) {
      return true;
    }

    const ip = request.ip || request.connection.remoteAddress;
    const userId = request.user?.id;
    const apiPath = request.path;

    // 检查 IP 限流
    const ipResult = await this.rateLimitingService.checkIpLimit(ip, {
      ttl: rateLimitOptions.ttl,
      maxRequests: rateLimitOptions.maxRequests || 100,
      skipSuccessfulRequests: rateLimitOptions.skipSuccessfulRequests,
    });

    // 记录指标
    this.monitoringService.recordRateLimit('ip', ipResult.allowed);

    if (!ipResult.allowed) {
      throw new GatewayException(
        ErrorCode.RATE_LIMIT_IP_EXCEEDED,
        'IP rate limit exceeded',
        429,
      );
    }

    // 如果用户已登录，检查用户限流
    if (userId) {
      const userResult = await this.rateLimitingService.checkUserLimit(
        userId,
        {
          ttl: rateLimitOptions.ttl,
          maxRequests: rateLimitOptions.maxRequests || 100,
          skipSuccessfulRequests: rateLimitOptions.skipSuccessfulRequests,
        },
      );

      // 记录指标
      this.monitoringService.recordRateLimit('user', userResult.allowed);

      if (!userResult.allowed) {
        throw new GatewayException(
          ErrorCode.RATE_LIMIT_USER_EXCEEDED,
          'User rate limit exceeded',
          429,
        );
      }
    }

    // 检查 API 限流
    const apiResult = await this.rateLimitingService.checkApiLimit(apiPath, {
      ttl: rateLimitOptions.ttl,
      maxRequests: rateLimitOptions.maxRequests || 100,
      skipSuccessfulRequests: rateLimitOptions.skipSuccessfulRequests,
    });

    // 记录指标
    this.monitoringService.recordRateLimit('api', apiResult.allowed);

    if (!apiResult.allowed) {
      throw new GatewayException(
        ErrorCode.RATE_LIMIT_API_EXCEEDED,
        'API rate limit exceeded',
        429,
      );
    }

    return true;
  }

  /**
   * 当且仅当配置了 `GATEWAY_E2E_TOKEN` 且请求携带匹配的 `x-e2e-token` 头时，跳过登录类端点的 IP/API 限流。
   * 生产环境不设该变量则行为与默认一致。
   */
  private shouldBypassRateLimitForE2EAutomation(request: { path?: string; headers?: Record<string, unknown> }): boolean {
    const expected = String(process.env.GATEWAY_E2E_TOKEN ?? '').trim();
    if (!expected) return false;
    const p = String(request?.path ?? '');
    if (!p.includes('/auth/login')) return false;
    const raw = request?.headers?.['x-e2e-token'] ?? request?.headers?.['X-E2E-Token'];
    const headerVal = Array.isArray(raw) ? raw[0] : raw;
    return typeof headerVal === 'string' && headerVal === expected;
  }
}









