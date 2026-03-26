import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { RateLimitingService } from '../rate-limiting.service.js';
import { RateLimitConfig } from '../config/rate-limit.config.js';

/**
 * 节流守卫
 * 更严格的限流，用于防止短时间内大量请求
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(private readonly rateLimitingService: RateLimitingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection.remoteAddress;

    // 使用更严格的配置
    const config: RateLimitConfig = {
      ttl: 10, // 10秒窗口
      maxRequests: 5, // 最多5个请求
      skipSuccessfulRequests: false,
    };

    const result = await this.rateLimitingService.checkIpLimit(ip, config);

    if (!result.allowed) {
      throw new Error('Too many requests');
    }

    return true;
  }
}









































