import { Injectable } from '@nestjs/common';
import { CacheService } from '../common/cache/cache.service.js';
import { ConfigService } from '../common/config/config.service.js';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * 健康检查服务
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 检查网关健康状态
   */
  async checkGateway(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 检查缓存健康状态
   */
  async checkCache(): Promise<{ status: string; latency?: number }> {
    try {
      const startTime = Date.now();
      await this.cacheService.exists('health-check');
      const latency = Date.now() - startTime;

      return {
        status: 'ok',
        latency,
      };
    } catch (error) {
      return {
        status: 'error',
      };
    }
  }

  /**
   * 检查后端服务健康状态
   */
  async checkServices(): Promise<{
    api: { status: string; latency?: number };
    webhooks: { status: string; latency?: number };
    worker: { status: string; latency?: number };
  }> {
    const services = this.configService.getServicesConfig();
    const httpConfig = this.configService.getHttpConfig();

    const checkService = async (url: string) => {
      try {
        const startTime = Date.now();
        await firstValueFrom(
          this.httpService.get(`${url}/api/health`, {
            timeout: httpConfig.timeout,
          }),
        );
        const latency = Date.now() - startTime;
        return { status: 'ok', latency };
      } catch (error) {
        return { status: 'error' };
      }
    };

    const [api, webhooks, worker] = await Promise.all([
      checkService(services.apiServiceUrl),
      checkService(services.webhooksServiceUrl),
      checkService(services.workerServiceUrl),
    ]);

    return { api, webhooks, worker };
  }

  /**
   * 综合健康检查
   */
  async checkAll(): Promise<{
    status: string;
    gateway: { status: string; timestamp: string };
    cache: { status: string; latency?: number };
    services: {
      api: { status: string; latency?: number };
      webhooks: { status: string; latency?: number };
      worker: { status: string; latency?: number };
    };
  }> {
    const [gateway, cache, services] = await Promise.all([
      this.checkGateway(),
      this.checkCache(),
      this.checkServices(),
    ]);

    const allHealthy =
      cache.status === 'ok' &&
      services.api.status === 'ok' &&
      services.webhooks.status === 'ok' &&
      services.worker.status === 'ok';

    return {
      status: allHealthy ? 'ok' : 'degraded',
      gateway,
      cache,
      services,
    };
  }
}









































