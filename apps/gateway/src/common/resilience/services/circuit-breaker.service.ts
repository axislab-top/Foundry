import { Injectable, Optional, Inject } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service.js';
import { ConfigService } from '../../config/config.service.js';

/**
 * 断路器状态
 */
export enum CircuitBreakerState {
  CLOSED = 'closed', // 关闭（正常）
  OPEN = 'open', // 打开（故障）
  HALF_OPEN = 'half_open', // 半开（尝试恢复）
}

/**
 * 断路器统计信息
 */
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  nextAttemptTime: number | null;
}

/**
 * 断路器配置
 */
export interface CircuitBreakerConfig {
  failureThreshold: number; // 失败阈值（超过此值打开断路器）
  successThreshold: number; // 半开状态下的成功阈值
  timeout: number; // 超时时间（毫秒），超过此时间后尝试恢复
  resetTimeout: number; // 重置超时（毫秒），打开状态持续此时间后进入半开状态
}

/**
 * 断路器服务
 * 实现断路器模式，防止级联故障
 */
@Injectable()
export class CircuitBreakerService {
  private readonly CACHE_PREFIX = 'circuit_breaker:';

  constructor(
    private readonly cacheService: CacheService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /**
   * 获取断路器状态
   */
  async getState(serviceName: string): Promise<CircuitBreakerState> {
    const stats = await this.getStats(serviceName);
    return stats.state;
  }

  /**
   * 获取断路器统计信息
   */
  async getStats(serviceName: string): Promise<CircuitBreakerStats> {
    const cacheKey = this.getCacheKey(serviceName);
    const cached = await this.cacheService.get<CircuitBreakerStats>(cacheKey);

    if (cached) {
      // 检查是否需要状态转换
      return await this.updateState(serviceName, cached);
    }

    // 默认状态：关闭
    return {
      state: CircuitBreakerState.CLOSED,
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      nextAttemptTime: null,
    };
  }

  /**
   * 记录成功
   */
  async recordSuccess(serviceName: string): Promise<void> {
    const stats = await this.getStats(serviceName);
    const config = this.getConfig(serviceName);

    if (stats.state === CircuitBreakerState.HALF_OPEN) {
      // 半开状态：增加成功计数
      stats.successes += 1;

      if (stats.successes >= config.successThreshold) {
        // 达到成功阈值，关闭断路器
        stats.state = CircuitBreakerState.CLOSED;
        stats.failures = 0;
        stats.successes = 0;
        stats.lastFailureTime = null;
        stats.nextAttemptTime = null;
      }
    } else if (stats.state === CircuitBreakerState.CLOSED) {
      // 关闭状态：重置失败计数
      stats.failures = 0;
      stats.successes = 0;
    }

    await this.saveStats(serviceName, stats);
  }

  /**
   * 记录失败
   */
  async recordFailure(serviceName: string): Promise<void> {
    const stats = await this.getStats(serviceName);
    const config = this.getConfig(serviceName);

    stats.failures += 1;
    stats.lastFailureTime = Date.now();
    stats.successes = 0; // 重置成功计数

    if (stats.state === CircuitBreakerState.CLOSED) {
      // 关闭状态：检查是否超过失败阈值
      if (stats.failures >= config.failureThreshold) {
        // 打开断路器
        stats.state = CircuitBreakerState.OPEN;
        stats.nextAttemptTime = Date.now() + config.resetTimeout;
      }
    } else if (stats.state === CircuitBreakerState.HALF_OPEN) {
      // 半开状态：任何失败都重新打开
      stats.state = CircuitBreakerState.OPEN;
      stats.nextAttemptTime = Date.now() + config.resetTimeout;
    }

    await this.saveStats(serviceName, stats);
  }

  /**
   * 检查是否可以执行请求
   */
  async canExecute(serviceName: string): Promise<boolean> {
    const stats = await this.getStats(serviceName);

    if (stats.state === CircuitBreakerState.CLOSED) {
      return true;
    }

    if (stats.state === CircuitBreakerState.OPEN) {
      // 检查是否可以尝试恢复
      if (stats.nextAttemptTime && Date.now() >= stats.nextAttemptTime) {
        // 进入半开状态
        stats.state = CircuitBreakerState.HALF_OPEN;
        stats.successes = 0;
        await this.saveStats(serviceName, stats);
        return true;
      }
      return false;
    }

    if (stats.state === CircuitBreakerState.HALF_OPEN) {
      return true;
    }

    return false;
  }

  /**
   * 重置断路器
   */
  async reset(serviceName: string): Promise<void> {
    const stats: CircuitBreakerStats = {
      state: CircuitBreakerState.CLOSED,
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      nextAttemptTime: null,
    };
    await this.saveStats(serviceName, stats);
  }

  /**
   * 更新状态（检查状态转换）
   */
  private async updateState(
    serviceName: string,
    stats: CircuitBreakerStats,
  ): Promise<CircuitBreakerStats> {
    const config = this.getConfig(serviceName);

    // 检查打开状态是否应该进入半开状态
    if (
      stats.state === CircuitBreakerState.OPEN &&
      stats.nextAttemptTime &&
      Date.now() >= stats.nextAttemptTime
    ) {
      stats.state = CircuitBreakerState.HALF_OPEN;
      stats.successes = 0;
      await this.saveStats(serviceName, stats);
    }

    return stats;
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(serviceName: string): string {
    return `${this.CACHE_PREFIX}${serviceName}`;
  }

  /**
   * 保存统计信息
   */
  private async saveStats(
    serviceName: string,
    stats: CircuitBreakerStats,
  ): Promise<void> {
    const cacheKey = this.getCacheKey(serviceName);
    // 缓存24小时（足够长）
    await this.cacheService.set(cacheKey, stats, 86400);
  }

  /**
   * 获取配置（可以根据服务名返回不同配置）
   */
  private getConfig(serviceName: string): CircuitBreakerConfig {
    // 如果配置服务可用，从配置读取
    if (this.configService) {
      const config = this.configService.getCircuitBreakerConfig();
      return {
        failureThreshold: config.failureThreshold,
        successThreshold: config.successThreshold,
        timeout: config.timeout,
        resetTimeout: config.resetTimeout,
      };
    }
    
    // 默认配置
    return {
      failureThreshold: 5, // 连续5次失败后打开
      successThreshold: 2, // 半开状态下2次成功后关闭
      timeout: 60000, // 60秒超时
      resetTimeout: 30000, // 30秒后尝试恢复
    };
  }
}




