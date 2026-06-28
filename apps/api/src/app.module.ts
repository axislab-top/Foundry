import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { MailModule } from './common/mail/mail.module.js';
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
import { CompaniesModule } from './modules/companies/companies.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { AgentsModule } from './modules/agents/agents.module.js';
import { SkillsModule } from './modules/skills/skills.module.js';
import { ToolsModule } from './modules/tools/tools.module.js';
import { McpToolsModule } from './modules/mcp-tools/mcp-tools.module.js';
import { CollaborationModule } from './modules/collaboration/collaboration.module.js';
import { MemoryModule } from './modules/memory/memory.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { FileAssetsModule } from './modules/file-assets/file-assets.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { TemplatesModule } from './modules/templates/templates.module.js';
import { LlmKeysModule } from './modules/llm-keys/llm-keys.module.js';
import { EmbeddingModelsModule } from './modules/embedding-models/embedding-models.module.js';
import { LlmProvidersModule } from './modules/llm-providers/llm-providers.module.js';
import { LlmModelsModule } from './modules/llm-models/llm-models.module.js';
import { AlertsModule } from './modules/alerts/alerts.module.js';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module.js';
import { CompanySpaceModule } from './modules/company-space/company-space.module.js';
import { PlatformOpsModule } from './modules/platform-ops/platform-ops.module.js';
import { ApprovalModule } from './modules/approval/approval.module.js';
import { SupervisorModule } from './modules/supervisor/supervisor.module.js';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module.js';
import { AdminUsersModule } from './modules/admin-users/admin-users.module.js';
import { FactsModule } from './modules/facts/facts.module.js';
import { DailyBriefModule } from './modules/daily-brief/daily-brief.module.js';
import { ScheduledPlaybooksModule } from './modules/scheduled-playbooks/scheduled-playbooks.module.js';
import { MessagingModule } from '@service/messaging';
import { TenantModule } from '@service/tenant';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { LoggerMiddleware } from './common/middleware/logger.middleware.js';
import { UserContextMiddleware } from './common/middleware/user-context.middleware.js';
import { TestUserMiddleware } from './common/middleware/test-user.middleware.js';
import { DefaultAdminInitializerService } from './common/utils/default-admin.initializer.service.js';
import { RpcModule } from './common/rpc/rpc.module.js';

/**
 * 应用根模块
 */
@Module({
  imports: [
    ConfigModule,
    MailModule,
    CacheModule,
    DatabaseModule,
    MonitoringModule,
    ExceptionsModule,
    SecurityModule,
    GuardsModule,
    HealthModule,
    // 消息队列模块（全局注册）
    MessagingModule.forRoot(),
    RpcModule,
    TenantModule,
    UsersModule,
    AuthModule,
    OAuthModule,
    FilesModule,
    CompaniesModule,
    ToolsModule,
    McpToolsModule,
    SkillsModule,
    AgentsModule,
    OrganizationModule,
    CollaborationModule,
    MemoryModule,
    FactsModule,
    TasksModule,
    ProjectsModule,
    FileAssetsModule,
    BillingModule,
    TemplatesModule,
    LlmKeysModule,
    EmbeddingModelsModule,
    LlmProvidersModule,
    LlmModelsModule,
    AlertsModule,
    AdminDashboardModule,
    CompanySpaceModule,
    PlatformOpsModule,
    PlatformSettingsModule,
    AdminUsersModule,
    ApprovalModule,
    SupervisorModule,
    DailyBriefModule,
    ScheduledPlaybooksModule,
  ],
  controllers: [],
  providers: [DefaultAdminInitializerService],
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





