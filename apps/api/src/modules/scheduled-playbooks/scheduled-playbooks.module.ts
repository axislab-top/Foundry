import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '@service/messaging';
import { TenantModule } from '@service/tenant';
import { CacheModule } from '../../common/cache/cache.module.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { Company } from '../companies/entities/company.entity.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { CompanyScheduledPlaybook } from './entities/company-scheduled-playbook.entity.js';
import { ScheduledPlaybookCompletedListener } from './listeners/scheduled-playbook-completed.listener.js';
import { ScheduledPlaybookTickListener } from './listeners/scheduled-playbook-tick.listener.js';
import { ScheduledPlaybookMetricsService } from './services/scheduled-playbook-metrics.service.js';
import { ScheduledPlaybookRunnerService } from './services/scheduled-playbook-runner.service.js';
import { ScheduledPlaybooksService } from './services/scheduled-playbooks.service.js';
import { ScheduledPlaybooksController } from './scheduled-playbooks.controller.js';
import { ScheduledPlaybooksRpcController } from './scheduled-playbooks.rpc.controller.js';
import { ScheduledPlaybooksToolsInternalController } from './scheduled-playbooks-tools-internal.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyScheduledPlaybook, Agent, Company]),
    TenantModule,
    MessagingModule,
    CacheModule,
    forwardRef(() => CompaniesModule),
    forwardRef(() => TasksModule),
    forwardRef(() => CollaborationModule),
  ],
  controllers: [
    ScheduledPlaybooksController,
    ScheduledPlaybooksRpcController,
    ScheduledPlaybooksToolsInternalController,
  ],
  providers: [
    ScheduledPlaybooksService,
    ScheduledPlaybookRunnerService,
    ScheduledPlaybookMetricsService,
    ScheduledPlaybookTickListener,
    ScheduledPlaybookCompletedListener,
  ],
  exports: [ScheduledPlaybooksService, ScheduledPlaybookRunnerService],
})
export class ScheduledPlaybooksModule {}
