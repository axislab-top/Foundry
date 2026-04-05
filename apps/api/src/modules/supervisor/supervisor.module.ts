import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '@service/messaging';
import { TenantModule } from '@service/tenant';
import { BillingModule } from '../billing/billing.module.js';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { ChatRoom } from '../collaboration/entities/chat-room.entity.js';
import { MemoryModule } from '../memory/memory.module.js';
import { TaskExecutionLog } from '../tasks/entities/task-execution-log.entity.js';
import { TaskRun } from '../tasks/entities/task-run.entity.js';
import { Task } from '../tasks/entities/task.entity.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { SupervisorLesson } from './entities/supervisor-lesson.entity.js';
import { SupervisorInternalController } from './supervisor-internal.controller.js';
import { SupervisorRpcController } from './supervisor.rpc.controller.js';
import { SupervisorLessonQueryService } from './services/supervisor-lesson-query.service.js';
import { SupervisorMetricsService } from './services/supervisor-metrics.service.js';
import { SupervisorReportService } from './services/supervisor-report.service.js';
import { SupervisorReviewService } from './services/supervisor-review.service.js';
import { SupervisorTemporalBridgeService } from './services/supervisor-temporal-bridge.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupervisorLesson,
      TaskRun,
      TaskExecutionLog,
      Task,
      Agent,
      ChatRoom,
    ]),
    TenantModule,
    MessagingModule,
    MemoryModule,
    BillingModule,
    CollaborationModule,
  ],
  controllers: [SupervisorRpcController, SupervisorInternalController],
  providers: [
    SupervisorReviewService,
    SupervisorTemporalBridgeService,
    SupervisorMetricsService,
    SupervisorReportService,
    SupervisorLessonQueryService,
  ],
  exports: [
    SupervisorReviewService,
    SupervisorTemporalBridgeService,
    SupervisorMetricsService,
    SupervisorReportService,
    SupervisorLessonQueryService,
  ],
})
export class SupervisorModule {}
