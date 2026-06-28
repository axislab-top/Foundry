import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '@service/messaging';
import { TenantModule } from '@service/tenant';
import { ApprovalModule } from '../approval/approval.module.js';
import { ApprovalRequest } from '../approval/entities/approval-request.entity.js';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { Company } from '../companies/entities/company.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { Task } from '../tasks/entities/task.entity.js';
import { TaskRun } from '../tasks/entities/task-run.entity.js';
import { TaskExecutionLog } from '../tasks/entities/task-execution-log.entity.js';
import { User } from '../users/entities/user.entity.js';
import { CompanyDailyBriefSnapshot } from './entities/company-daily-brief-snapshot.entity.js';
import { DailyBriefRpcController } from './daily-brief.rpc.controller.js';
import { HeartbeatDailyBriefListener } from './listeners/heartbeat-daily-brief.listener.js';
import { DailyBriefMetricsService } from './services/daily-brief-metrics.service.js';
import { DailyBriefSummaryService } from './services/daily-brief-summary.service.js';
import { DailyBriefService } from './services/daily-brief.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyDailyBriefSnapshot,
      Company,
      CompanyMembership,
      Task,
      TaskRun,
      TaskExecutionLog,
      ApprovalRequest,
      User,
    ]),
    TenantModule,
    MessagingModule,
    ApprovalModule,
    CollaborationModule,
  ],
  controllers: [DailyBriefRpcController],
  providers: [
    DailyBriefService,
    DailyBriefMetricsService,
    DailyBriefSummaryService,
    HeartbeatDailyBriefListener,
  ],
  exports: [DailyBriefService, DailyBriefSummaryService],
})
export class DailyBriefModule {}
