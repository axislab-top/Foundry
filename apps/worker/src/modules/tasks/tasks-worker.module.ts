import { Module } from '@nestjs/common';
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
import { TaskRunFailedSupervisorListener } from './listeners/task-run-failed-supervisor.listener.js';

@Module({
  imports: [ConfigModule, AutonomousModule, AgentsModule],
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
    PendingAgentTaskExecutionService,
    CeoHeartbeatRunCoordinatorService,
    TemporalHeartbeatIngressService,
  ],
})
export class TasksWorkerModule {}
