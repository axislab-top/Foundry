import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  MetricsManager,
  createMetricsConfigFromEnv,
  Counter,
  Histogram,
  Gauge,
} from '@service/monitoring';

/**
 * 监控服务
 * 封装 @service/monitoring，提供统一的监控功能
 */
@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private metricsManager: MetricsManager;
  
  // HTTP 请求相关指标
  private requestCounter: Counter;
  private requestDuration: Histogram;
  private requestErrors: Counter;
  private activeConnections: Gauge;
  
  // 限流相关指标
  private rateLimitHits: Counter;
  private rateLimitRejected: Counter;
  
  // 断路器相关指标
  private circuitBreakerState: Gauge;
  private circuitBreakerFailures: Counter;
  private circuitBreakerSuccesses: Counter;
  private circuitBreakerOpens: Counter;
  
  // IP过滤相关指标
  private ipFilterBlocked: Counter;
  
  // 缓存相关指标
  private cacheHits: Counter;
  private cacheMisses: Counter;
  private cacheOperations: Counter;
  
  // 重试相关指标
  private retryAttempts: Counter;
  private retryExhausted: Counter;

  onModuleInit() {
    // 创建指标管理器
    const config = createMetricsConfigFromEnv();
    this.metricsManager = MetricsManager.create(config);

    // 注册HTTP请求指标
    this.requestCounter = this.metricsManager.registerCounter({
      name: 'gateway_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
    });

    this.requestDuration = this.metricsManager.registerHistogram({
      name: 'gateway_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    this.requestErrors = this.metricsManager.registerCounter({
      name: 'gateway_http_request_errors_total',
      help: 'Total number of HTTP request errors',
      labelNames: ['method', 'path', 'status'],
    });

    this.activeConnections = this.metricsManager.registerGauge({
      name: 'gateway_active_connections',
      help: 'Number of active connections',
      labelNames: [],
    });

    // 注册限流指标
    this.rateLimitHits = this.metricsManager.registerCounter({
      name: 'gateway_rate_limit_checks_total',
      help: 'Total number of rate limit checks',
      labelNames: ['type', 'result'], // type: ip|user|api, result: allowed|rejected
    });

    this.rateLimitRejected = this.metricsManager.registerCounter({
      name: 'gateway_rate_limit_rejected_total',
      help: 'Total number of requests rejected by rate limit',
      labelNames: ['type'], // type: ip|user|api
    });

    // 注册断路器指标
    this.circuitBreakerState = this.metricsManager.registerGauge({
      name: 'gateway_circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=half_open, 2=open)',
      labelNames: ['service'],
    });

    this.circuitBreakerFailures = this.metricsManager.registerCounter({
      name: 'gateway_circuit_breaker_failures_total',
      help: 'Total number of circuit breaker failures',
      labelNames: ['service'],
    });

    this.circuitBreakerSuccesses = this.metricsManager.registerCounter({
      name: 'gateway_circuit_breaker_successes_total',
      help: 'Total number of circuit breaker successes',
      labelNames: ['service'],
    });

    this.circuitBreakerOpens = this.metricsManager.registerCounter({
      name: 'gateway_circuit_breaker_opens_total',
      help: 'Total number of times circuit breaker opened',
      labelNames: ['service'],
    });

    // 注册IP过滤指标
    this.ipFilterBlocked = this.metricsManager.registerCounter({
      name: 'gateway_ip_filter_blocked_total',
      help: 'Total number of requests blocked by IP filter',
      labelNames: ['type'], // type: whitelist|blacklist
    });

    // 注册缓存指标
    this.cacheHits = this.metricsManager.registerCounter({
      name: 'gateway_cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_type'],
    });

    this.cacheMisses = this.metricsManager.registerCounter({
      name: 'gateway_cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_type'],
    });

    this.cacheOperations = this.metricsManager.registerCounter({
      name: 'gateway_cache_operations_total',
      help: 'Total number of cache operations',
      labelNames: ['operation'], // operation: get|set|delete
    });

    // 注册重试指标
    this.retryAttempts = this.metricsManager.registerCounter({
      name: 'gateway_retry_attempts_total',
      help: 'Total number of retry attempts',
      labelNames: ['service', 'attempt'],
    });

    this.retryExhausted = this.metricsManager.registerCounter({
      name: 'gateway_retry_exhausted_total',
      help: 'Total number of requests that exhausted retries',
      labelNames: ['service'],
    });
  }

  onModuleDestroy() {
    // 清理资源
    if (this.metricsManager) {
      // MetricsManager 使用单例模式，这里不需要关闭
      // 如果需要在测试中重置，可以调用 MetricsManager.reset()
    }
  }

  /**
   * 获取指标管理器
   */
  getMetricsManager(): MetricsManager {
    return this.metricsManager;
  }

  /**
   * 记录请求
   */
  recordRequest(method: string, path: string, status: number, duration: number) {
    const labels = {
      method: method.toUpperCase(),
      path: this.normalizePath(path),
      status: status.toString(),
    };

    this.requestCounter.inc(labels);
    this.requestDuration.observe(
      {
        method: labels.method,
        path: labels.path,
      },
      duration / 1000, // 转换为秒
    );

    // 记录错误（4xx 和 5xx）
    if (status >= 400) {
      this.requestErrors.inc(labels);
    }
  }

  /**
   * 增加活动连接数
   */
  incrementActiveConnections() {
    this.activeConnections.inc();
  }

  /**
   * 减少活动连接数
   */
  decrementActiveConnections() {
    this.activeConnections.dec();
  }

  /**
   * 设置活动连接数
   */
  setActiveConnections(value: number) {
    this.activeConnections.set({}, value);
  }

  /**
   * 导出指标（Prometheus 格式）
   */
  async exportMetrics(): Promise<string> {
    return await this.metricsManager.export('prometheus');
  }

  /**
   * 记录限流检查
   */
  recordRateLimit(type: 'ip' | 'user' | 'api', allowed: boolean) {
    this.rateLimitHits.inc({
      type,
      result: allowed ? 'allowed' : 'rejected',
    });

    if (!allowed) {
      this.rateLimitRejected.inc({ type });
    }
  }

  /**
   * 更新断路器状态
   */
  updateCircuitBreakerState(service: string, state: 'closed' | 'half_open' | 'open') {
    const stateValue = state === 'closed' ? 0 : state === 'half_open' ? 1 : 2;
    this.circuitBreakerState.set({ service }, stateValue);
  }

  /**
   * 记录断路器失败
   */
  recordCircuitBreakerFailure(service: string) {
    this.circuitBreakerFailures.inc({ service });
  }

  /**
   * 记录断路器成功
   */
  recordCircuitBreakerSuccess(service: string) {
    this.circuitBreakerSuccesses.inc({ service });
  }

  /**
   * 记录断路器打开
   */
  recordCircuitBreakerOpen(service: string) {
    this.circuitBreakerOpens.inc({ service });
  }

  /**
   * 记录IP过滤拦截
   */
  recordIpFilterBlocked(type: 'whitelist' | 'blacklist') {
    this.ipFilterBlocked.inc({ type });
  }

  /**
   * 记录缓存命中
   */
  recordCacheHit(cacheType: string) {
    this.cacheHits.inc({ cache_type: cacheType });
  }

  /**
   * 记录缓存未命中
   */
  recordCacheMiss(cacheType: string) {
    this.cacheMisses.inc({ cache_type: cacheType });
  }

  /**
   * 记录缓存操作
   */
  recordCacheOperation(operation: 'get' | 'set' | 'delete') {
    this.cacheOperations.inc({ operation });
  }

  /**
   * 记录重试尝试
   */
  recordRetryAttempt(service: string, attempt: number) {
    this.retryAttempts.inc({ service, attempt: attempt.toString() });
  }

  /**
   * 记录重试耗尽
   */
  recordRetryExhausted(service: string) {
    this.retryExhausted.inc({ service });
  }

  /**
   * 规范化路径（用于指标标签）
   * 将动态路径参数替换为占位符
   */
  private normalizePath(path: string): string {
    // 移除查询参数
    const pathWithoutQuery = path.split('?')[0];
    
    // 替换常见的ID模式
    let normalized = pathWithoutQuery
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id');
    
    return normalized;
  }
}

