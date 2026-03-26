import { SetMetadata } from '@nestjs/common';

/**
 * 限流装饰器
 * 标记需要限流的路由
 */
export const RATE_LIMIT_KEY = 'rateLimit';
export interface RateLimitOptions {
  ttl?: number; // 时间窗口（秒）
  maxRequests?: number; // 最大请求数
  skipSuccessfulRequests?: boolean; // 是否跳过成功请求
}

export const RateLimit = (options?: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options || {});









































