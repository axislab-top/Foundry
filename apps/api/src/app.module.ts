import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from './common/config/config.module.js';
import { CacheModule } from './common/cache/cache.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { MonitoringModule } from './common/monitoring/monitoring.module.js';
import { ExceptionsModule } from './common/exceptions/exceptions.module.js';
import { SecurityModule } from './common/security/security.module.js';
import { GuardsModule } from './common/guards/guards.module.js';
import { HealthModule } from './health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { OAuthModule } from './modules/oauth/oauth.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { MessagingModule } from '@service/messaging';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { LoggerMiddleware } from './common/middleware/logger.middleware.js';
import { UserContextMiddleware } from './common/middleware/user-context.middleware.js';
import { TestUserMiddleware } from './common/middleware/test-user.middleware.js';

/**
 * 应用根模块
 */
@Module({
  imports: [
    ConfigModule,
    CacheModule,
    DatabaseModule,
    MonitoringModule,
    ExceptionsModule,
    SecurityModule,
    GuardsModule,
    HealthModule,
    // 消息队列模块（全局注册）
    MessagingModule.forRoot(),
    UsersModule,
    AuthModule,
    OAuthModule,
    FilesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, LoggerMiddleware, UserContextMiddleware)
      .forRoutes('*');

    // 测试环境开关：允许通过 Header 注入用户信息，便于无 Gateway 时跑用例
    if (process.env.TEST_AUTH_ENABLED === 'true') {
      consumer.apply(TestUserMiddleware).forRoutes('*');
    }
  }
}





