import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/entities/company.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { AdminDashboardRpcController } from './admin-dashboard.rpc.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Company, CompanyMembership]), TasksModule, BillingModule],
  controllers: [AdminDashboardRpcController],
  providers: [AdminDashboardService],
})
export class AdminDashboardModule {}

