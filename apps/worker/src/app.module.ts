import { Module } from '@nestjs/common';
import { MessagingModule } from '@service/messaging';
import { HealthController } from './health/health.controller.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { MonitoringModule } from './common/monitoring/monitoring.module.js';
import { ConfigModule } from './common/config/config.module.js';
import { IdempotencyModule } from './common/idempotency/idempotency.module.js';

@Module({
  imports: [
    // 统一配置管理模块（全局模块）
    ConfigModule,
    // 消息队列模块（全局注册）
    MessagingModule.forRoot(),
    // 幂等模块（全局）
    IdempotencyModule,
    // 监控模块（提供 /api/metrics 端点）
    MonitoringModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}












