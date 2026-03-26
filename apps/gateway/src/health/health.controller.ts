import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';
import { HealthService } from './health.service.js';

interface HealthCheckResponse {
  status: 'ok' | 'error' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
  checks?: {
    [key: string]: {
      status: 'ok' | 'error' | 'degraded';
      message?: string;
    };
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  async check(): Promise<HealthCheckResponse> {
    const result = await this.healthService.checkAll();

    return {
      status: result.status as 'ok' | 'error' | 'degraded',
      timestamp: new Date().toISOString(),
      service: 'gateway-service',
      version: process.env.APP_VERSION || 'unknown',
      checks: {
        gateway: {
          status: result.gateway.status as 'ok' | 'error' | 'degraded',
        },
        cache: {
          status: result.cache.status as 'ok' | 'error' | 'degraded',
        },
        api: {
          status: result.services.api.status as 'ok' | 'error' | 'degraded',
        },
        webhooks: {
          status: result.services.webhooks.status as
            | 'ok'
            | 'error'
            | 'degraded',
        },
        worker: {
          status: result.services.worker.status as 'ok' | 'error' | 'degraded',
        },
      },
    };
  }

  @Get('gateway')
  async checkGateway() {
    return this.healthService.checkGateway();
  }

  @Get('cache')
  async checkCache() {
    return this.healthService.checkCache();
  }

  @Get('services')
  async checkServices() {
    return this.healthService.checkServices();
  }
}


