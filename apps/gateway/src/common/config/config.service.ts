import { Injectable, Inject } from '@nestjs/common';
import { ConfigManager } from '@service/config';
import {
  AppConfig,
  JwtConfig,
  DatabaseConfig,
  RedisConfig,
  ServicesConfig,
  RateLimitConfig,
  HttpConfig,
  CorsConfig,
  GatewayConfig,
  CircuitBreakerConfig,
  WechatOAuthConfig,
  TracingConfig,
} from './interfaces/config.interface.js';

/**
 * 配置服务
 * 提供类型安全的配置访问
 * 使用 @service/config 进行配置管理
 */
@Injectable()
export class ConfigService {
  private configManager: ConfigManager;

  constructor(@Inject('CONFIG_MANAGER') configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * 获取应用配置
   */
  getAppConfig(): AppConfig {
    return {
      nodeEnv: this.configManager.get<string>('NODE_ENV', 'development'),
      port: this.configManager.get<number>('PORT', 3002),
    };
  }

  /**
   * 获取 JWT 配置
   */
  getJwtConfig(): JwtConfig {
    return {
      secret: this.configManager.get<string>('JWT_SECRET')!,
      expiresIn: this.configManager.get<string>('JWT_EXPIRES_IN', '15m'),
      refreshSecret: this.configManager.get<string>('JWT_REFRESH_SECRET')!,
      refreshExpiresIn: this.configManager.get<string>(
        'JWT_REFRESH_EXPIRES_IN',
        '7d',
      ),
    };
  }

  /**
   * 获取数据库配置
   */
  getDatabaseConfig(): DatabaseConfig {
    return {
      host: this.configManager.get<string>('DB_HOST', 'localhost'),
      port: this.configManager.get<number>('DB_PORT', 5432),
      username: this.configManager.get<string>('DB_USERNAME', 'postgres'),
      password: this.configManager.get<string>('DB_PASSWORD', 'postgres'),
      database: this.configManager.get<string>('DB_DATABASE', 'gateway_db'),
      synchronize: this.configManager.get<boolean>('DB_SYNCHRONIZE', false),
      logging: this.configManager.get<boolean>('DB_LOGGING', false),
      ssl: this.configManager.get<boolean>('DB_SSL', false),
      sslRejectUnauthorized: this.configManager.get<boolean>('DB_SSL_REJECT_UNAUTHORIZED', true),
      connectionTimeout: this.configManager.get<number>('DB_CONNECTION_TIMEOUT', 2000),
      queryTimeout: this.configManager.get<number>('DB_QUERY_TIMEOUT', 30000),
      maxConnections: this.configManager.get<number>('DB_MAX_CONNECTIONS', 20),
      minConnections: this.configManager.get<number>('DB_MIN_CONNECTIONS', 5),
      transactionIsolation: this.configManager.get<'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'>(
        'DB_TRANSACTION_ISOLATION',
        'READ COMMITTED',
      ),
    };
  }

  /**
   * 获取 Redis 配置
   */
  getRedisConfig(): RedisConfig {
    return {
      host: this.configManager.get<string>('REDIS_HOST', 'localhost'),
      port: this.configManager.get<number>('REDIS_PORT', 6379),
      password: this.configManager.get<string>('REDIS_PASSWORD'),
      db: this.configManager.get<number>('REDIS_DB', 0),
      url: this.configManager.get<string>('REDIS_URL'),
    };
  }

  /**
   * 获取服务地址配置
   */
  getServicesConfig(): ServicesConfig {
    return {
      apiServiceUrl: this.configManager.get<string>(
        'API_SERVICE_URL',
        'http://localhost:3000',
      ),
      webhooksServiceUrl: this.configManager.get<string>(
        'WEBHOOKS_SERVICE_URL',
        'http://localhost:3003',
      ),
      workerServiceUrl: this.configManager.get<string>(
        'WORKER_SERVICE_URL',
        'http://localhost:3004',
      ),
      loggingServiceUrl: this.configManager.get<string>(
        'LOGGING_SERVICE_URL',
        'http://localhost:3001',
      ),
    };
  }

  /**
   * 获取限流配置
   */
  getRateLimitConfig(): RateLimitConfig {
    return {
      ttl: this.configManager.get<number>('RATE_LIMIT_TTL', 60),
      maxRequests: this.configManager.get<number>(
        'RATE_LIMIT_MAX_REQUESTS',
        100,
      ),
      skipSuccessfulRequests: this.configManager.get<boolean>(
        'RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS',
        false,
      ),
    };
  }

  /**
   * 获取 HTTP 配置
   */
  getHttpConfig(): HttpConfig {
    const retryEnabled = this.configManager.get<boolean>('HTTP_RETRY_ENABLED', true);
    const retryMaxRetries = this.configManager.get<number>('HTTP_RETRY_MAX_RETRIES', 3);
    const retryDelay = this.configManager.get<number>('HTTP_RETRY_DELAY', 1000);
    const retryStrategy = this.configManager.get<'fixed' | 'exponential' | 'linear'>(
      'HTTP_RETRY_STRATEGY',
      'fixed',
    );
    const retryMaxDelay = this.configManager.get<number>('HTTP_RETRY_MAX_DELAY', 10000);
    const retryableStatusCodes = this.configManager.get<string>(
      'HTTP_RETRY_RETRYABLE_STATUS_CODES',
      '500,502,503,504',
    );
    const retryableErrors = this.configManager.get<string>(
      'HTTP_RETRY_RETRYABLE_ERRORS',
      'ECONNABORTED,ETIMEDOUT,ECONNREFUSED,ENOTFOUND',
    );

    return {
      timeout: this.configManager.get<number>('HTTP_TIMEOUT', 30000),
      retry: retryEnabled
        ? {
            enabled: true,
            maxRetries: retryMaxRetries,
            retryDelay,
            strategy: retryStrategy,
            maxRetryDelay: retryMaxDelay,
            retryableStatusCodes: retryableStatusCodes
              .split(',')
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => !isNaN(n)),
            retryableErrors: retryableErrors
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0),
          }
        : undefined,
    };
  }

  /**
   * 获取 CORS 配置
   */
  getCorsConfig(): CorsConfig {
    const origin = this.configManager.get<string>('CORS_ORIGIN', '*');
    return {
      origin: origin === '*' ? '*' : origin.split(','),
      credentials: this.configManager.get<boolean>('CORS_CREDENTIALS', true),
    };
  }

  /**
   * 获取断路器配置
   */
  getCircuitBreakerConfig(): CircuitBreakerConfig {
    const enabled = this.configManager.get<boolean>('CIRCUIT_BREAKER_ENABLED', true);
    
    return {
      enabled,
      failureThreshold: this.configManager.get<number>(
        'CIRCUIT_BREAKER_FAILURE_THRESHOLD',
        5,
      ),
      successThreshold: this.configManager.get<number>(
        'CIRCUIT_BREAKER_SUCCESS_THRESHOLD',
        2,
      ),
      timeout: this.configManager.get<number>('CIRCUIT_BREAKER_TIMEOUT', 60000),
      resetTimeout: this.configManager.get<number>(
        'CIRCUIT_BREAKER_RESET_TIMEOUT',
        30000,
      ),
      // 错误过滤器：只统计 5xx 错误
      errorFilter: (error: any) => {
        const status = error?.status || error?.response?.status || error?.code;
        // 只统计服务器错误（5xx）和网络错误
        if (typeof status === 'number') {
          return status >= 500;
        }
        // 网络错误（如超时、连接失败等）
        return ['ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(
          error?.code,
        );
      },
    };
  }

  /**
   * 获取微信 OAuth 配置
   */
  getWechatOAuthConfig(): WechatOAuthConfig {
    return {
      appId: this.configManager.get<string>('WECHAT_APP_ID')!,
      appSecret: this.configManager.get<string>('WECHAT_APP_SECRET')!,
      redirectUri: this.configManager.get<string>('WECHAT_REDIRECT_URI')!,
      scope: this.configManager.get<string>('WECHAT_SCOPE', 'snsapi_login'),
    };
  }

  /**
   * 获取追踪配置
   */
  getTracingConfig(): TracingConfig | null {
    const enabled = this.configManager.get<boolean>('TRACING_ENABLED', false);
    if (!enabled) {
      return null;
    }

    const serviceName = this.configManager.get<string>(
      'TRACING_SERVICE_NAME',
      'gateway-service',
    );
    const serviceVersion = this.configManager.get<string>(
      'TRACING_SERVICE_VERSION',
      '1.0.0',
    );
    const exporter = this.configManager.get<
      'jaeger' | 'zipkin' | 'otlp' | 'console' | 'none'
    >('TRACING_EXPORTER', 'console');

    return {
      enabled: true,
      serviceName,
      serviceVersion,
      exporter,
      jaegerEndpoint: this.configManager.get<string>('TRACING_JAEGER_ENDPOINT'),
      zipkinEndpoint: this.configManager.get<string>('TRACING_ZIPKIN_ENDPOINT'),
      otlpEndpoint: this.configManager.get<string>('TRACING_OTLP_ENDPOINT'),
      otlpHeaders: this.parseHeaders(
        this.configManager.get<string>('TRACING_OTLP_HEADERS'),
      ),
      samplingRate: this.configManager.get<number>('TRACING_SAMPLING_RATE', 1.0),
      attributes: this.parseAttributes(
        this.configManager.get<string>('TRACING_ATTRIBUTES'),
      ),
    };
  }

  /**
   * 解析请求头字符串
   */
  private parseHeaders(headersStr?: string): Record<string, string> | undefined {
    if (!headersStr) {
      return undefined;
    }

    try {
      const headers: Record<string, string> = {};
      const pairs = headersStr.split(',');
      for (const pair of pairs) {
        const [key, value] = pair.split('=').map((s) => s.trim());
        if (key && value) {
          headers[key] = value;
        }
      }
      return headers;
    } catch {
      return undefined;
    }
  }

  /**
   * 解析属性字符串
   */
  private parseAttributes(
    attributesStr?: string,
  ): Record<string, string> | undefined {
    if (!attributesStr) {
      return undefined;
    }

    try {
      const attributes: Record<string, string> = {};
      const pairs = attributesStr.split(',');
      for (const pair of pairs) {
        const [key, value] = pair.split('=').map((s) => s.trim());
        if (key && value) {
          attributes[key] = value;
        }
      }
      return attributes;
    } catch {
      return undefined;
    }
  }

  /**
   * 获取完整配置
   */
  getConfig(): GatewayConfig {
    return {
      app: this.getAppConfig(),
      jwt: this.getJwtConfig(),
      database: this.getDatabaseConfig(),
      redis: this.getRedisConfig(),
      services: this.getServicesConfig(),
      rateLimit: this.getRateLimitConfig(),
      http: this.getHttpConfig(),
      cors: this.getCorsConfig(),
      wechatOAuth: this.getWechatOAuthConfig(),
    };
  }
}

