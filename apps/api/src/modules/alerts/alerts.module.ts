import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createRequire } from 'node:module';
import { AdminAlert } from './entities/admin-alert.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { AlertsService } from './alerts.service.js';
import { BudgetSignalsAlertListener } from './listeners/billsignals-alert.listener.js';
import { SkillRiskAlertListener } from './listeners/skill-risk-alert.listener.js';
import { TaskAnomalyAlertListener } from './listeners/task-anomaly-alert.listener.js';
import { AlertsRpcController } from './alerts.rpc.controller.js';

const require = createRequire(import.meta.url);

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminAlert, CompanyMembership]),
    forwardRef(() => require('../collaboration/collaboration.module.js').CollaborationModule),
  ],
  controllers: [AlertsRpcController],
  providers: [
    AlertsService,
    BudgetSignalsAlertListener,
    SkillRiskAlertListener,
    TaskAnomalyAlertListener,
  ],
  exports: [AlertsService],
})
export class AlertsModule {}

