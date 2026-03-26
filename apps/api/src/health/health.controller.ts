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
      status: 'ok' | 'error';
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
    const result = await this.healthService.checkHealth();

    return {
      status: result.database.connected ? 'ok' : 'error',
      timestamp: result.timestamp,
      service: 'api-service',
      version: process.env.APP_VERSION || 'unknown',
      checks: {
        database: {
          status: result.database.connected ? 'ok' : 'error',
        },
      },
    };
  }
}





