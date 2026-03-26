import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from '../types/express.types.js';
import { RateLimitingService } from '../../modules/rate-limiting/rate-limiting.service.js';
import { ConfigService } from '../config/config.service.js';
import { ErrorCode } from '../exceptions/error-codes.js';
import { GatewayException } from '../exceptions/filters/gateway-exception.filter.js';

/**
 * 限流中间件
 * 基础限流检查
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(
    private readonly rateLimitingService: RateLimitingService,
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';

    try {
      const result = await this.rateLimitingService.checkIpLimit(ip);

      // 设置限流响应头
      res.setHeader('X-RateLimit-Limit', result.limit.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.resetTime.toString());

      if (!result.allowed) {
        throw new GatewayException(
          ErrorCode.RATE_LIMIT_EXCEEDED,
          'Rate limit exceeded',
          429,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  }
}



















