import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '@service/messaging';
import { TenantModule } from '@service/tenant';
import { AgentsModule } from '../agents/agents.module.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { CompanyHeartbeatConfig } from '../companies/entities/company-heartbeat-config.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';
import { SkillsModule } from '../skills/skills.module.js';
import { TaskAssignment } from './entities/task-assignment.entity.js';
import { TaskDependency } from './entities/task-dependency.entity.js';
import { TaskExecutionLog } from './entities/task-execution-log.entity.js';
import { TaskRun } from './entities/task-run.entity.js';
import { Task } from './entities/task.entity.js';
import { CollaborationTaskExtractedTasksListener } from './listeners/collaboration-task-extracted.listener.js';
import { CompanyCreatedTasksListener } from './listeners/company-created-tasks.listener.js';
import { DashboardService } from './services/dashboard.service.js';
import { DirectorManagementFacadeService } from './services/director-management-facade.service.js';
import { DirectorManagementService } from './services/director-management.service.js';
import { TaskExecutionService } from './services/task-execution.service.js';
import { TaskOrchestratorService } from './services/task-orchestrator.service.js';
import { TaskRunService } from './services/task-run.service.js';
import { TaskApprovalAtomicBindingService } from './services/task-approval-atomic-binding.service.js';
import { TasksService } from './services/tasks.service.js';
import { DepartmentTaskPipelineService } from './services/department-task-pipeline.service.js';
import { TaskDistributionPlannerService } from './services/task-distribution-planner.service.js';
import { TasksRpcController } from './tasks.rpc.controller.js';
import { TasksToolsInternalController } from './tasks-tools-internal.controller.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { SupervisorModule } from '../supervisor/supervisor.module.js';
import { ApprovalModule } from '../approval/approval.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      TaskAssignment,
      TaskDependency,
      TaskExecutionLog,
      TaskRun,
      CompanyMembership,
      CompanyHeartbeatConfig,
      Agent,
      OrganizationNode,
    ]),
    MessagingModule,
    TenantModule,
    ApprovalModule,
    AgentsModule,
    SkillsModule,
    CollaborationModule,
    ObservabilityModule,
    SupervisorModule,
    BillingModule,
    MemoryModule,
    ProjectsModule,
  ],
  controllers: [TasksRpcController, TasksToolsInternalController],
  providers: [
    TasksService,
    DepartmentTaskPipelineService,
    TaskDistributionPlannerService,
    TaskOrchestratorService,
    TaskExecutionService,
    TaskRunService,
    DashboardService,
    DirectorManagementService,
    DirectorManagementFacadeService,
    TaskApprovalAtomicBindingService,
    CollaborationTaskExtractedTasksListener,
    CompanyCreatedTasksListener,
  ],
  exports: [
    TasksService,
    DepartmentTaskPipelineService,
    TaskExecutionService,
    TaskRunService,
    DashboardService,
    DirectorManagementService,
    DirectorManagementFacadeService,
    TaskApprovalAtomicBindingService,
  ],
})
export class TasksModule {}
