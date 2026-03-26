/**
 * 限流结果接口
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number; // 重置时间（Unix 时间戳）
  limit: number;
}

/**
 * 限流策略接口
 */
export interface IRateLimitStrategy {
  checkLimit(identifier: string, config: any): Promise<RateLimitResult>;
}









































