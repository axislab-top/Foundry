import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { TaskBreakdownRequestedEvent } from '@contracts/events';
import { AutonomousOrchestratorService } from '../../autonomous/autonomous-orchestrator.service.js';

/**
 * 订阅 task.breakdown.requested：走与 Heartbeat 同一 CEO 图（runKind=breakdown），后续接入 tasks.create 子任务树写入。
 */
@Injectable()
export class TaskBreakdownRequestedListener implements OnModuleInit {
  private readonly logger = new Logger(TaskBreakdownRequestedListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly autonomous: AutonomousOrchestratorService,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<TaskBreakdownRequestedEvent>(
      'task.breakdown.requested',
      this.handle.bind(this),
      {
        queue: 'worker-task-breakdown-queue',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(event: TaskBreakdownRequestedEvent): Promise<void> {
    this.logger.log('task.breakdown.requested', {
      companyId: event.data.companyId,
      goalPreview: event.data.goal?.slice(0, 120),
      rootTaskId: event.data.rootTaskId,
    });
    try {
      await this.autonomous.runBreakdown(event);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn('autonomous.runBreakdown failed', {
        companyId: event.data.companyId,
        message,
      });
    }
  }
}
