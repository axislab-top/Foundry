/**
 * 限流配置
 */
export interface RateLimitConfig {
  ttl: number; // 时间窗口（秒）
  maxRequests: number; // 最大请求数
  skipSuccessfulRequests?: boolean; // 是否跳过成功请求
}

/**
 * 默认限流配置
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  ttl: 60,
  maxRequests: 100,
  skipSuccessfulRequests: false,
};









































