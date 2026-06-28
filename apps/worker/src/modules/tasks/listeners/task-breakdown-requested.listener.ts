import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { TaskBreakdownRequestedEvent } from '@contracts/events';
import { CompanyOrchestratorService } from '../../company-runtime/company-orchestrator.service.js';
import { AutonomousRunCoordinatorService } from '../../autonomous/autonomous-run-coordinator.service.js';

/**
 * 订阅 task.breakdown.requested：走与 Heartbeat 同一 CEO 图（runKind=breakdown），后续接入 tasks.create 子任务树写入。
 */
@Injectable()
export class TaskBreakdownRequestedListener implements OnModuleInit {
  private readonly logger = new Logger(TaskBreakdownRequestedListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly companyOrchestrator: CompanyOrchestratorService,
    private readonly runCoordinator: AutonomousRunCoordinatorService,
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
      roomId: event.data.context?.roomId ?? null,
      sourceMessageId: event.data.context?.sourceMessageId ?? null,
      mentionedAgentId: event.data.context?.mentionedAgentId ?? null,
    });
    try {
      await this.companyOrchestrator.runBreakdown(event);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn('companyOrchestrator.runBreakdown failed', {
        companyId: event.data.companyId,
        message,
      });
      return;
    }

    await this.runCoordinator.runPendingAfterBreakdown(event.data.companyId);
  }
}
