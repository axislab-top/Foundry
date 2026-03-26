import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { MonitoringModule } from './common/monitoring/monitoring.module.js';
import { ConfigModule } from './common/config/config.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { GuardsModule } from './common/guards/guards.module.js';
import { UserContextMiddleware } from './common/middleware/user-context.middleware.js';

@Module({
  imports: [
    // 统一配置管理模块（全局模块）
    ConfigModule,
    // 数据库模块（全局模块）
    DatabaseModule,
    // 监控模块（提供 /api/metrics 端点）
    MonitoringModule,
    // 鉴权守卫模块（读取 x-user-info）
    GuardsModule,
    // Webhooks 业务模块
    WebhooksModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UserContextMiddleware).forRoutes('*');
  }
}

































