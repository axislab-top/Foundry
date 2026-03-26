import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { MonitoringService } from './monitoring.service.js';

/**
 * 监控模块
 * 全局模块，提供监控服务
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}






































