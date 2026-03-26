import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from '../../../common/types/express.types.js';
import { IpFilterService } from '../services/ip-filter.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { GatewayException } from '../../../common/exceptions/filters/gateway-exception.filter.js';
import { IpFilterType } from '../dto/query-ip-filter.dto.js';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';

/**
 * IP过滤中间件
 * 检查请求IP是否在白名单或黑名单中
 */
@Injectable()
export class IpFilterMiddleware implements NestMiddleware {
  private readonly SKIP_PATHS = [
    '/api/health',
    '/metrics',
  ];

  constructor(
    private readonly ipFilterService: IpFilterService,
    private readonly monitoringService: MonitoringService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // 跳过特定路径
    if (this.shouldSkip(req.path)) {
      return next();
    }

    try {
      // 获取客户端IP
      const clientIp = this.extractClientIp(req);
      if (!clientIp) {
        // 如果无法获取IP，允许通过（可以根据需求调整）
        return next();
      }

      // 获取当前路由
      const route = req.path;

      // 检查IP
      const matchResult = await this.ipFilterService.checkIp(clientIp, route);

      if (!matchResult.matched) {
        // 没有匹配到任何规则，允许通过
        return next();
      }

      // 如果匹配到黑名单，拒绝请求
      if (matchResult.type === IpFilterType.BLACKLIST) {
        // 记录指标
        this.monitoringService.recordIpFilterBlocked('blacklist');
        throw new GatewayException(
          ErrorCode.FORBIDDEN,
          `IP ${clientIp} is blocked by blacklist`,
          403,
        );
      }

      // 如果匹配到白名单，允许通过
      if (matchResult.type === IpFilterType.WHITELIST) {
        return next();
      }

      // 默认允许通过（可以根据需求调整策略）
      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * 提取客户端IP
   */
  private extractClientIp(req: Request): string | null {
    // 优先级：X-Forwarded-For > X-Real-IP > req.ip > req.connection.remoteAddress
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // X-Forwarded-For可能包含多个IP，取第一个
      const ips = Array.isArray(forwardedFor) ? forwardedFor : forwardedFor.split(',');
      return ips[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    if (req.ip) {
      return req.ip;
    }

    const remoteAddress = req.socket?.remoteAddress;
    if (remoteAddress) {
      // 如果是IPv6映射的IPv4地址，提取IPv4部分
      if (remoteAddress.startsWith('::ffff:')) {
        return remoteAddress.substring(7);
      }
      return remoteAddress;
    }

    return null;
  }

  /**
   * 判断是否应该跳过验证
   */
  private shouldSkip(path: string): boolean {
    return this.SKIP_PATHS.some((skipPath) => {
      if (skipPath.endsWith('*')) {
        return path.startsWith(skipPath.slice(0, -1));
      }
      return path === skipPath || path.startsWith(skipPath);
    });
  }
}

