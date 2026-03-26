import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';
import { ConfigService } from '../common/config/config.service.js';

interface HealthCheckResponse {
  status: 'ok' | 'error';
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
  constructor(private readonly configService: ConfigService) {}

  @Get()
  @Public()
  check(): HealthCheckResponse {
    const appConfig = this.configService.getAppConfig();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'webhooks-service',
      version: appConfig.version || 'unknown',
      checks: {
        self: {
          status: 'ok',
        },
      },
    };
  }
}


































