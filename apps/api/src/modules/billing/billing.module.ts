import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '@service/messaging';
import { TenantModule } from '@service/tenant';
import { Company } from '../companies/entities/company.entity.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { MarketplaceAgent } from '../templates/entities/marketplace-agent.entity.js';
import { BillingRpcController } from './billing.rpc.controller.js';
import { RechargeOrdersRpcController } from './recharge-orders.rpc.controller.js';
import { UserCreditAccount } from './entities/user-credit-account.entity.js';
import { BillingBalanceCredit } from './entities/billing-balance-credit.entity.js';
import { BillingRechargeOrder } from './entities/billing-recharge-order.entity.js';
import { BillingRecord } from './entities/billing-record.entity.js';
import { BillingSettings } from './entities/billing-settings.entity.js';
import { DailyAgentUsage } from './entities/daily-agent-usage.entity.js';
import { Budget } from './entities/budget.entity.js';
import { ModelPricing } from './entities/model-pricing.entity.js';
import { AgentCreatedBillingListener } from './listeners/agent-created-billing.listener.js';
import { CompanyCreatedBillingListener } from './listeners/company-created-billing.listener.js';
import { UserCreatedBillingListener } from './listeners/user-created-billing.listener.js';
import { BillingService } from './services/billing.service.js';
import { AgentUsageService } from './services/agent-usage.service.js';
import { BudgetService } from './services/budget.service.js';
import { DashboardBillingService } from './services/dashboard-billing.service.js';
import { ModelRouterService } from './services/model-router.service.js';
import { AgentLlmPricingSnapshotService } from './services/agent-llm-pricing-snapshot.service.js';
import { RechargeOrdersService } from './services/recharge-orders.service.js';
import { UserCreditService } from './services/user-credit.service.js';
import { LlmKey } from '../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../llm-keys/entities/llm-key-daily-usage.entity.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Budget,
      BillingRecord,
      ModelPricing,
      BillingSettings,
      DailyAgentUsage,
      Company,
      Agent,
      MarketplaceAgent,
      LlmKey,
      LlmKeyDailyUsage,
      BillingRechargeOrder,
      BillingBalanceCredit,
      UserCreditAccount,
    ]),
    MessagingModule,
    TenantModule,
    PlatformSettingsModule,
  ],
  controllers: [BillingRpcController, RechargeOrdersRpcController],
  providers: [
    BudgetService,
    BillingService,
    AgentUsageService,
    RechargeOrdersService,
    UserCreditService,
    ModelRouterService,
    DashboardBillingService,
    AgentLlmPricingSnapshotService,
    CompanyCreatedBillingListener,
    UserCreatedBillingListener,
    AgentCreatedBillingListener,
  ],
  exports: [
    BudgetService,
    BillingService,
    AgentUsageService,
    RechargeOrdersService,
    UserCreditService,
    ModelRouterService,
    DashboardBillingService,
    AgentLlmPricingSnapshotService,
  ],
})
export class BillingModule {}
