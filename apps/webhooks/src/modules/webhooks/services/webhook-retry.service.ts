import { Injectable } from '@nestjs/common';
import { createLogger, LogLevel } from '@service/logging';
import { Webhook } from '../entities/webhook.entity.js';
import { WebhookForwarderService } from './webhook-forwarder.service.js';

/**
 * Webhook 重试服务
 * 实现指数退避重试策略
 */
@Injectable()
export class WebhookRetryService {
  private readonly logger = createLogger({
    service: 'webhooks-service',
    level: LogLevel.INFO,
  });

  constructor(
    private readonly forwarderService: WebhookForwarderService,
  ) {}

  /**
   * 重试转发 Webhook
   * @param webhook Webhook 配置
   * @param event 事件类型
   * @param payload 请求体
   * @param maxRetries 最大重试次数
   * @returns 最终结果
   */
  async retryForward(
    webhook: Webhook,
    event: string,
    payload: any,
    maxRetries?: number,
  ): Promise<{ success: boolean; statusCode?: number; response?: any; error?: string; duration: number; retryCount: number }> {
    const maxRetryCount = maxRetries ?? webhook.retryCount ?? 3;
    let retryCount = 0;
    let lastError: string | undefined;
    let lastStatusCode: number | undefined;
    let lastResponse: any;
    let totalDuration = 0;

    while (retryCount <= maxRetryCount) {
      const result = await this.forwarderService.forward(webhook, event, payload);
      totalDuration += result.duration;

      if (result.success) {
        return {
          ...result,
          retryCount,
          duration: totalDuration,
        };
      }

      // 记录错误
      lastError = result.error;
      lastStatusCode = result.statusCode;
      lastResponse = result.response;

      // 如果已达到最大重试次数，退出循环
      if (retryCount >= maxRetryCount) {
        break;
      }

      // 计算退避时间（指数退避：1s, 2s, 4s, 8s...）
      const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000); // 最大30秒

      this.logger.warn('Webhook forwarding failed, retrying', {
        webhookId: webhook.id,
        webhookName: webhook.name,
        retryCount: retryCount + 1,
        maxRetries: maxRetryCount,
        backoffMs,
        error: lastError,
      });

      // 等待后重试
      await this.sleep(backoffMs);
      retryCount++;
    }

    this.logger.error('Webhook forwarding failed after all retries', {
      webhookId: webhook.id,
      webhookName: webhook.name,
      retryCount,
      error: lastError,
    });

    return {
      success: false,
      statusCode: lastStatusCode,
      error: lastError,
      response: lastResponse,
      duration: totalDuration,
      retryCount,
    };
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
