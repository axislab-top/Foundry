import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { RedisCacheService } from '../cache/redis-cache.service.js';
import { ResilienceModule } from '../resilience/resilience.module.js';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { CompanyExecutionCoordinationService } from './company-execution-coordination.service.js';

@Global()
@Module({
  imports: [ConfigModule, ResilienceModule, MonitoringModule],
  providers: [RedisCacheService, CompanyExecutionCoordinationService],
  exports: [CompanyExecutionCoordinationService],
})
export class CompanyExecutionCoordinationModule {}
