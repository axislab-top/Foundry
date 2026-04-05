import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '@service/messaging';
import { TenantModule } from '@service/tenant';
import { Agent } from '../agents/entities/agent.entity.js';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';
import { TaskAssignment } from './entities/task-assignment.entity.js';
import { TaskDependency } from './entities/task-dependency.entity.js';
import { TaskExecutionLog } from './entities/task-execution-log.entity.js';
import { TaskRun } from './entities/task-run.entity.js';
import { Task } from './entities/task.entity.js';
import { CollaborationTaskExtractedTasksListener } from './listeners/collaboration-task-extracted.listener.js';
import { CompanyCreatedTasksListener } from './listeners/company-created-tasks.listener.js';
import { DashboardService } from './services/dashboard.service.js';
import { TaskExecutionService } from './services/task-execution.service.js';
import { TaskOrchestratorService } from './services/task-orchestrator.service.js';
import { TaskRunService } from './services/task-run.service.js';
import { TasksService } from './services/tasks.service.js';
import { TasksRpcController } from './tasks.rpc.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      TaskAssignment,
      TaskDependency,
      TaskExecutionLog,
      TaskRun,
      CompanyMembership,
      Agent,
      OrganizationNode,
    ]),
    MessagingModule,
    TenantModule,
    CollaborationModule,
  ],
  controllers: [TasksRpcController],
  providers: [
    TasksService,
    TaskOrchestratorService,
    TaskExecutionService,
    TaskRunService,
    DashboardService,
    CollaborationTaskExtractedTasksListener,
    CompanyCreatedTasksListener,
  ],
  exports: [TasksService, TaskExecutionService, TaskRunService, DashboardService],
})
export class TasksModule {}
