import { Module } from '@nestjs/common';
import { CacheModule } from '../../common/cache/cache.module.js';
import { MonitoringModule } from '../../common/monitoring/monitoring.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { IpFilterService } from './services/ip-filter.service.js';
import { IpFilterController } from './ip-filter.controller.js';
import { IpFilterMiddleware } from './middleware/ip-filter.middleware.js';

/**
 * IP过滤模块
 * 提供IP黑白名单管理功能
 */
@Module({
  imports: [CacheModule, MonitoringModule, AuthModule],
  controllers: [IpFilterController],
  providers: [IpFilterService, IpFilterMiddleware],
  exports: [IpFilterService, IpFilterMiddleware],
})
export class IpFilterModule {}

