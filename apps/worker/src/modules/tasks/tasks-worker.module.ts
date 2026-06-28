import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '../../common/config/config.module.js';
import { AutonomousModule } from '../autonomous/autonomous.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { TaskBreakdownRequestedListener } from './listeners/task-breakdown-requested.listener.js';
import { TaskHeartbeatTickListener } from './listeners/task-heartbeat-tick.listener.js';
import { TaskCompletedAutonomousListener } from './listeners/task-completed-autonomous.listener.js';
import { BudgetWarningAutonomousListener } from './listeners/budget-warning-autonomous.listener.js';
import { TaskHeartbeatScheduler } from './task-heartbeat.scheduler.js';
import { PendingAgentTaskExecutionService } from './pending-agent-tasks.service.js';
import { ExecutionTokenGuard } from '../approval/execution-token.guard.js';
import { WorkerInternalAuthGuard } from './worker-internal-auth.guard.js';
import { InternalGatedDemoController } from './internal-gated-demo.controller.js';
import { InternalTemporalController } from './internal-temporal.controller.js';
import { TemporalHeartbeatIngressService } from './temporal-heartbeat-ingress.service.js';
import { CeoHeartbeatRunCoordinatorService } from './ceo-heartbeat-run-coordinator.service.js';
import { AutonomousRunCoordinatorService } from '../autonomous/autonomous-run-coordinator.service.js';
import { TaskRunFailedSupervisorListener } from './listeners/task-run-failed-supervisor.listener.js';
import { DepartmentTaskSupervisionListener } from './listeners/department-task-supervision.listener.js';
import { CollaborationTaskDelegationListener } from './listeners/collaboration-task-delegation.listener.js';
import { CollaborationTaskDelegationPersistService } from './collaboration-task-delegation-persist.service.js';
import { CompanyOrchestratorService } from '../company-runtime/company-orchestrator.service.js';
import { CompanyStateService } from '../company-runtime/company-state.service.js';
import { CompanyCortexService } from '../company-runtime/company-cortex.service.js';
import { CompanyReviewService } from '../company-runtime/review-plan-act-report/company-review.service.js';
import { CompanyPlannerService } from '../company-runtime/review-plan-act-report/company-planner.service.js';
import { CompanyActorService } from '../company-runtime/review-plan-act-report/company-actor.service.js';
import { CompanyReporterService } from '../company-runtime/review-plan-act-report/company-reporter.service.js';
import { ApprovalGateService } from '../company-runtime/approval/approval-gate.service.js';
import { HeartbeatEscalationDeciderService } from '../company-runtime/heartbeat-escalation-decider.service.js';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { FileAssetsWorkerModule } from '../file-assets/file-assets-worker.module.js';

@Module({
  imports: [
    ConfigModule,
    AutonomousModule,
    AgentsModule,
    FileAssetsWorkerModule,
    forwardRef(() => CollaborationModule),
  ],
  controllers: [InternalTemporalController, InternalGatedDemoController],
  providers: [
    ExecutionTokenGuard,
    WorkerInternalAuthGuard,
    TaskBreakdownRequestedListener,
    TaskHeartbeatScheduler,
    TaskHeartbeatTickListener,
    TaskCompletedAutonomousListener,
    BudgetWarningAutonomousListener,
    TaskRunFailedSupervisorListener,
    DepartmentTaskSupervisionListener,
    CollaborationTaskDelegationListener,
    CollaborationTaskDelegationPersistService,
    PendingAgentTaskExecutionService,
    CeoHeartbeatRunCoordinatorService,
    AutonomousRunCoordinatorService,
    CompanyOrchestratorService,
    CompanyStateService,
    CompanyCortexService,
    CompanyReviewService,
    CompanyPlannerService,
    CompanyActorService,
    CompanyReporterService,
    ApprovalGateService,
    HeartbeatEscalationDeciderService,
    TemporalHeartbeatIngressService,
  ],
  exports: [
    CeoHeartbeatRunCoordinatorService,
    AutonomousRunCoordinatorService,
    CompanyOrchestratorService,
    PendingAgentTaskExecutionService,
  ],
})
export class TasksWorkerModule {}
