import { Module } from '@nestjs/common';
import { LoggerModule } from './logger/logger.module.js';
import { HealthController } from './health/health.controller.js';
import { ConfigModule } from './common/config/config.module.js';

@Module({
  imports: [
    // 统一配置管理模块（全局模块）
    ConfigModule,
    LoggerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

