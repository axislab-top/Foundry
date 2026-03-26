import { Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { RetryConfig } from '../../config/interfaces/config.interface.js';

/**
 * 重试服务
 * 处理请求重试逻辑
 */
@Injectable()
export class RetryService {
  /**
   * 计算重试延迟
   */
  calculateDelay(attempt: number, config: RetryConfig): number {
    const baseDelay = config.retryDelay;
    let delay: number;

    switch (config.strategy) {
      case 'fixed':
        delay = baseDelay;
        break;
      case 'exponential':
        delay = baseDelay * Math.pow(2, attempt);
        break;
      case 'linear':
        delay = baseDelay * (attempt + 1);
        break;
      default:
        delay = baseDelay;
    }

    // 应用最大延迟限制
    if (config.maxRetryDelay) {
      delay = Math.min(delay, config.maxRetryDelay);
    }

    return delay;
  }

  /**
   * 判断错误是否可重试
   */
  isRetryable(error: any, config: RetryConfig): boolean {
    // 如果没有错误，不可重试
    if (!error) {
      return false;
    }

    const axiosError = error as AxiosError;

    // 检查 HTTP 状态码
    if (axiosError.response) {
      const statusCode = axiosError.response.status;
      if (
        config.retryableStatusCodes &&
        config.retryableStatusCodes.includes(statusCode)
      ) {
        return true;
      }
      // 5xx 错误默认可重试
      if (statusCode >= 500 && statusCode < 600) {
        return true;
      }
      // 4xx 错误通常不可重试（除非明确配置）
      return false;
    }

    // 检查网络错误
    if (axiosError.code || axiosError.message) {
      const errorCode = axiosError.code || '';
      const errorMessage = axiosError.message || '';

      // 检查配置的可重试错误码
      if (
        config.retryableErrors &&
        config.retryableErrors.some((code) => {
          return (
            errorCode.includes(code) || errorMessage.includes(code)
          );
        })
      ) {
        return true;
      }

      // 默认可重试的错误码
      const defaultRetryableCodes = [
        'ECONNABORTED',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ENOTFOUND',
        'ENETUNREACH',
      ];

      if (
        defaultRetryableCodes.some(
          (code) => errorCode.includes(code) || errorMessage.includes(code),
        )
      ) {
        return true;
      }
    }

    // 检查超时错误
    if (error.message && error.message.includes('timeout')) {
      return true;
    }

    return false;
  }

  /**
   * 等待指定时间
   */
  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 执行重试
   */
  async retry<T>(
    fn: () => Promise<T>,
    config: RetryConfig,
    onRetry?: (attempt: number, error: any) => void,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // 如果不是最后一次尝试且错误可重试，则继续重试
        if (attempt < config.maxRetries && this.isRetryable(error, config)) {
          const delay = this.calculateDelay(attempt, config);

          // 触发重试回调
          if (onRetry) {
            onRetry(attempt + 1, error);
          }

          // 等待后重试
          await this.sleep(delay);
          continue;
        }

        // 如果错误不可重试或已达到最大重试次数，抛出错误
        throw error;
      }
    }

    // 理论上不会到达这里，但为了类型安全
    throw lastError;
  }
}

