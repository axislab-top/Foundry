import {
  Module,
  NestModule,
  MiddlewareConsumer,
} from '@nestjs/common';
import { ConfigModule } from './common/config/config.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { CacheModule } from './common/cache/cache.module.js';
import { SecurityModule } from './common/security/security.module.js';
import { ExceptionsModule } from './common/exceptions/exceptions.module.js';
import { TracingModule } from './common/tracing/tracing.module.js';
import { TracingMiddleware } from './common/tracing/middleware/tracing.middleware.js';
import { InterceptorsModule } from './common/interceptors/interceptors.module.js';
import { MonitoringModule } from './common/monitoring/monitoring.module.js';
import { ResilienceModule } from './common/resilience/resilience.module.js';
import { ServiceDiscoveryModule } from './common/service-discovery/service-discovery.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { RoutingModule } from './modules/routing/routing.module.js';
import { ApiKeyModule } from './modules/api-key/api-key.module.js';
import { LlmKeysModule } from './modules/llm-keys/llm-keys.module.js';
import { EmbeddingModelsModule } from './modules/embedding-models/embedding-models.module.js';
import { LlmProvidersModule } from './modules/llm-providers/llm-providers.module.js';
import { LlmModelsModule } from './modules/llm-models/llm-models.module.js';
import { MarketplaceModule } from './modules/marketplace/marketplace.module.js';
import { SkillsModule } from './modules/skills/skills.module.js';
import { ToolsModule } from './modules/tools/tools.module.js';
import { McpToolsModule } from './modules/mcp-tools/mcp-tools.module.js';
import { AlertsModule } from './modules/alerts/alerts.module.js';
import { AdminNotifyModule } from './modules/admin-notify/admin-notify.module.js';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module.js';
import { CompanySpaceModule } from './modules/company-space/company-space.module.js';
import { PlatformOpsModule } from './modules/platform-ops/platform-ops.module.js';
import { IpFilterModule } from './modules/ip-filter/ip-filter.module.js';
import { RateLimitingModule } from './modules/rate-limiting/rate-limiting.module.js';
import { CircuitBreakerModule } from './modules/circuit-breaker/circuit-breaker.module.js';
import { SignatureMiddleware } from './common/security/middleware/signature.middleware.js';
import { ReplayAttackMiddleware } from './common/security/middleware/replay-attack.middleware.js';
import { CsrfProtectionMiddleware } from './common/security/middleware/csrf.middleware.js';
import { IpFilterMiddleware } from './modules/ip-filter/middleware/ip-filter.middleware.js';
import { RpcModule } from './common/rpc/rpc.module.js';
import { CollaborationWsModule } from './modules/collaboration/collaboration-ws.module.js';
import { TenantModule } from '@service/tenant';

/**
 * 应用根模块
 * 聚合所有功能模块
 */
@Module({
  imports: [
    // 基础配置模块（必须最先导入）
    ConfigModule,
    // 数据库模块
    DatabaseModule,
    // 缓存模块
    CacheModule,
    // 安全模块
    SecurityModule,
    // 异常处理模块
    ExceptionsModule,
    // 追踪模块（使用 forRoot 进行动态配置）
    TracingModule.forRoot(),
    // 拦截器模块
    InterceptorsModule,
    // 监控模块
    MonitoringModule,
    // 弹性模块（包含断路器、重试等）
    ResilienceModule,
    // 服务发现模块
    ServiceDiscoveryModule,
    // 审计模块
    AuditModule,
    // 健康检查模块
    HealthModule,
    // 认证模块
    AuthModule,
    // RPC Clients（给关键链路的 ClientProxy）
    RpcModule,
    TenantModule,
    // 路由模块（核心功能）
    RoutingModule,
    // API密钥模块
    ApiKeyModule,
    LlmKeysModule,
    EmbeddingModelsModule,
    LlmProvidersModule,
    LlmModelsModule,
    MarketplaceModule,
    SkillsModule,
    ToolsModule,
    McpToolsModule,
    AlertsModule,
    // IP过滤模块
    IpFilterModule,
    // 限流模块
    RateLimitingModule,
    // 断路器模块
    CircuitBreakerModule,
    // 实时协作 WebSocket
    CollaborationWsModule,
    AdminNotifyModule,
    AdminDashboardModule,
    CompanySpaceModule,
    PlatformOpsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 安全能力按 header 是否出现进行“条件校验”，避免影响纯 JWT 调用链路
    consumer
      .apply(
        TracingMiddleware,
        SignatureMiddleware,
        ReplayAttackMiddleware,
        CsrfProtectionMiddleware,
        IpFilterMiddleware,
      )
      .forRoutes('*');
  }
}
