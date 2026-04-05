import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '@service/messaging';
import { TenantModule } from '@service/tenant';
import { Company } from '../companies/entities/company.entity.js';
import { BillingRpcController } from './billing.rpc.controller.js';
import { BillingRecord } from './entities/billing-record.entity.js';
import { BillingSettings } from './entities/billing-settings.entity.js';
import { Budget } from './entities/budget.entity.js';
import { ModelPricing } from './entities/model-pricing.entity.js';
import { AgentCreatedBillingListener } from './listeners/agent-created-billing.listener.js';
import { CompanyCreatedBillingListener } from './listeners/company-created-billing.listener.js';
import { BillingService } from './services/billing.service.js';
import { BudgetService } from './services/budget.service.js';
import { DashboardBillingService } from './services/dashboard-billing.service.js';
import { ModelRouterService } from './services/model-router.service.js';
import { LlmKey } from '../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../llm-keys/entities/llm-key-daily-usage.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Budget,
      BillingRecord,
      ModelPricing,
      BillingSettings,
      Company,
      LlmKey,
      LlmKeyDailyUsage,
    ]),
    MessagingModule,
    TenantModule,
  ],
  controllers: [BillingRpcController],
  providers: [
    BudgetService,
    BillingService,
    ModelRouterService,
    DashboardBillingService,
    CompanyCreatedBillingListener,
    AgentCreatedBillingListener,
  ],
  exports: [BudgetService, BillingService, ModelRouterService, DashboardBillingService],
})
export class BillingModule {}
