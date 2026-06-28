import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/entities/company.entity.js';
import { LlmModel } from '../llm-models/entities/llm-model.entity.js';
import { LlmKey } from '../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../llm-keys/entities/llm-key-daily-usage.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { AdminDashboardRpcController } from './admin-dashboard.rpc.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      LlmKey,
      LlmKeyDailyUsage,
      LlmModel,
      CompanyMarketplaceAgentKeyAssignment,
    ]),
    TasksModule,
    BillingModule,
  ],
  controllers: [AdminDashboardRpcController],
  providers: [AdminDashboardService],
})
export class AdminDashboardModule {}

