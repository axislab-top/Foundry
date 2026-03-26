import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';
import { IpRateLimitStrategy } from './strategies/ip-rate-limit.strategy.js';
import { UserRateLimitStrategy } from './strategies/user-rate-limit.strategy.js';
import { ApiRateLimitStrategy } from './strategies/api-rate-limit.strategy.js';
import { RateLimitResult } from './interfaces/rate-limit.interface.js';
import { RateLimitConfig, DEFAULT_RATE_LIMIT_CONFIG } from './config/rate-limit.config.js';

/**
 * 限流服务
 */
@Injectable()
export class RateLimitingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly ipRateLimitStrategy: IpRateLimitStrategy,
    private readonly userRateLimitStrategy: UserRateLimitStrategy,
    private readonly apiRateLimitStrategy: ApiRateLimitStrategy,
  ) {}

  /**
   * 检查 IP 限流
   */
  async checkIpLimit(ip: string, config?: RateLimitConfig): Promise<RateLimitResult> {
    const rateLimitConfig = config || this.getDefaultConfig();
    return this.ipRateLimitStrategy.checkLimit(ip, rateLimitConfig);
  }

  /**
   * 检查用户限流
   */
  async checkUserLimit(userId: string, config?: RateLimitConfig): Promise<RateLimitResult> {
    const rateLimitConfig = config || this.getDefaultConfig();
    return this.userRateLimitStrategy.checkLimit(userId, rateLimitConfig);
  }

  /**
   * 检查 API 限流
   */
  async checkApiLimit(apiPath: string, config?: RateLimitConfig): Promise<RateLimitResult> {
    const rateLimitConfig = config || this.getDefaultConfig();
    return this.apiRateLimitStrategy.checkLimit(apiPath, rateLimitConfig);
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): RateLimitConfig {
    const config = this.configService.getRateLimitConfig();
    return {
      ttl: config.ttl,
      maxRequests: config.maxRequests,
      skipSuccessfulRequests: config.skipSuccessfulRequests,
    };
  }
}









































