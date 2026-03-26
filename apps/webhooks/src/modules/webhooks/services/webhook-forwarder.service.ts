import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import * as crypto from 'crypto';
import { createLogger, LogLevel } from '@service/logging';
import { Webhook } from '../entities/webhook.entity.js';
import { WebhookHistory } from '../entities/webhook-history.entity.js';

/**
 * Webhook 转发服务
 * 负责将 Webhook 请求转发到目标 URL
 */
@Injectable()
export class WebhookForwarderService {
  private readonly logger = createLogger({
    service: 'webhooks-service',
    level: LogLevel.INFO,
  });

  constructor(private readonly httpService: HttpService) {}

  /**
   * 转发 Webhook 请求
   */
  async forward(
    webhook: Webhook,
    event: string,
    payload: any,
  ): Promise<{ success: boolean; statusCode?: number; response?: any; error?: string; duration: number }> {
    const startTime = Date.now();
    const timeoutMs = webhook.timeout || 30000;

    try {
      // 构建请求配置
      const axiosConfig: AxiosRequestConfig = {
        method: 'POST',
        url: webhook.url,
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Webhooks-Service/1.0',
          'X-Webhook-Event': event,
          'X-Webhook-Id': webhook.id,
          'X-Webhook-Name': webhook.name,
        },
        data: payload,
      };

      // 如果配置了签名密钥，添加签名头
      if (webhook.secret) {
        const signature = this.generateSignature(JSON.stringify(payload), webhook.secret);
        axiosConfig.headers!['X-Webhook-Signature'] = signature;
      }

      this.logger.info('Forwarding webhook', {
        webhookId: webhook.id,
        webhookName: webhook.name,
        url: webhook.url,
        event,
      });

      // 发送请求
      const response = await firstValueFrom(
        this.httpService.request(axiosConfig).pipe(timeout(timeoutMs)),
      );

      const duration = Date.now() - startTime;

      this.logger.info('Webhook forwarded successfully', {
        webhookId: webhook.id,
        webhookName: webhook.name,
        statusCode: response.status,
        duration,
      });

      return {
        success: true,
        statusCode: response.status,
        response: response.data,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error.response
        ? `HTTP ${error.response.status}: ${error.response.statusText}`
        : error.message || 'Unknown error';

      this.logger.error('Webhook forwarding failed', {
        webhookId: webhook.id,
        webhookName: webhook.name,
        error: errorMessage,
        duration,
      });

      return {
        success: false,
        statusCode: error.response?.status,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * 生成 HMAC 签名
   */
  private generateSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  /**
   * 验证签名
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    // 使用时间安全比较防止时序攻击
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }
}
