import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '../common/config/config.module.js';
import { CacheModule } from '../common/cache/cache.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/**
 * 健康检查模块
 */
@Module({
  imports: [HttpModule, ConfigModule, CacheModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}









































