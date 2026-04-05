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
import { InternalTemporalController } from './internal-temporal.controller.js';
import { TemporalHeartbeatIngressService } from './temporal-heartbeat-ingress.service.js';

@Module({
  imports: [ConfigModule, AutonomousModule, AgentsModule],
  controllers: [InternalTemporalController],
  providers: [
    TaskBreakdownRequestedListener,
    TaskHeartbeatScheduler,
    TaskHeartbeatTickListener,
    TaskCompletedAutonomousListener,
    BudgetWarningAutonomousListener,
    PendingAgentTaskExecutionService,
    TemporalHeartbeatIngressService,
  ],
})
export class TasksWorkerModule {}
