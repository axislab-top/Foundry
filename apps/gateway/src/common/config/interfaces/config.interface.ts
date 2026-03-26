/**
 * 应用配置接口
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
}

/**
 * JWT 配置接口
 */
export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

/**
 * 数据库配置接口
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  ssl?: boolean;
  sslRejectUnauthorized?: boolean;
  connectionTimeout?: number;
  queryTimeout?: number;
  maxConnections?: number;
  minConnections?: number;
  transactionIsolation?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
}

/**
 * Redis 配置接口
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  url?: string;
}

/**
 * 服务地址配置接口
 */
export interface ServicesConfig {
  apiServiceUrl: string;
  webhooksServiceUrl: string;
  workerServiceUrl: string;
  loggingServiceUrl: string;
}

/**
 * 限流配置接口
 */
export interface RateLimitConfig {
  ttl: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
}

/**
 * 重试策略类型
 */
export type RetryStrategy = 'fixed' | 'exponential' | 'linear';

/**
 * 重试配置接口
 */
export interface RetryConfig {
  enabled: boolean;
  maxRetries: number;
  retryDelay: number;
  strategy: RetryStrategy;
  maxRetryDelay?: number;
  retryableStatusCodes?: number[];
  retryableErrors?: string[];
}

/**
 * HTTP 配置接口
 */
export interface HttpConfig {
  timeout: number;
  retry?: RetryConfig;
}

/**
 * 断路器配置接口
 */
export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number; // 失败阈值（超过此值打开断路器）
  successThreshold: number; // 半开状态下的成功阈值
  timeout: number; // 超时时间（毫秒），超过此时间后尝试恢复
  resetTimeout: number; // 重置超时（毫秒），打开状态持续此时间后进入半开状态
  errorFilter?: (error: any) => boolean; // 错误过滤器（可选）
}

/**
 * CORS 配置接口
 */
export interface CorsConfig {
  origin: string | string[];
  credentials: boolean;
}

/**
 * 微信 OAuth 配置接口
 */
export interface WechatOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  scope?: string;
}

/**
 * OpenTelemetry 导出器类型
 */
export type TracingExporterType = 'jaeger' | 'zipkin' | 'otlp' | 'console' | 'none';

/**
 * 追踪配置接口
 */
export interface TracingConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion?: string;
  exporter: TracingExporterType;
  jaegerEndpoint?: string;
  zipkinEndpoint?: string;
  otlpEndpoint?: string;
  otlpHeaders?: Record<string, string>;
  samplingRate?: number; // 0.0 - 1.0
  attributes?: Record<string, string>;
}

/**
 * 完整配置接口
 */
export interface GatewayConfig {
  app: AppConfig;
  jwt: JwtConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  services: ServicesConfig;
  rateLimit: RateLimitConfig;
  http: HttpConfig;
  cors: CorsConfig;
  circuitBreaker?: CircuitBreakerConfig;
  tracing?: TracingConfig;
  wechatOAuth?: WechatOAuthConfig;
}







