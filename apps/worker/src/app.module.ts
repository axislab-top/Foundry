import { Module } from '@nestjs/common';
import { MessagingModule } from '@service/messaging';
import { HealthController } from './health/health.controller.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CompaniesModule } from './modules/companies/companies.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { AgentsModule } from './modules/agents/agents.module.js';
import { CollaborationModule } from './modules/collaboration/collaboration.module.js';
import { MemoryWorkerModule } from './modules/memory/memory-worker.module.js';
import { TasksWorkerModule } from './modules/tasks/tasks-worker.module.js';
import { BillingWorkerModule } from './modules/billing/billing-worker.module.js';
import { TemplatesWorkerModule } from './modules/templates/templates-worker.module.js';
import { MonitoringModule } from './common/monitoring/monitoring.module.js';
import { ConfigModule } from './common/config/config.module.js';
import { IdempotencyModule } from './common/idempotency/idempotency.module.js';
import { TenantModule } from '@service/tenant';
import { WorkerApiRpcModule } from './common/rpc/worker-api-rpc.module.js';
import { WorkerRunnerRpcModule } from './common/rpc/worker-runner-rpc.module.js';
import { ObservabilityWorkerModule } from './common/observability/observability-worker.module.js';
import { AlertsWorkerModule } from './modules/alerts/alerts-worker.module.js';
import { CompanyRuntimeModule } from './modules/company-runtime/company-runtime.module.js';

@Module({
  imports: [
    // 统一配置管理模块（全局模块）
    ConfigModule,
    WorkerApiRpcModule,
    WorkerRunnerRpcModule,
    ObservabilityWorkerModule,
    // 消息队列模块（全局注册）
    MessagingModule.forRoot(),
    // 多租户上下文模块（CLS）
    TenantModule,
    // 幂等模块（全局）
    IdempotencyModule,
    // 监控模块（提供 /api/metrics 端点）
    MonitoringModule,
    UsersModule,
    AuthModule,
    CompaniesModule,
    OrganizationModule,
    AgentsModule,
    CollaborationModule,
    CompanyRuntimeModule,
    MemoryWorkerModule,
    TasksWorkerModule,
    BillingWorkerModule,
    TemplatesWorkerModule,
    AlertsWorkerModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}












