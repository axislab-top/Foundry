import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { TaskCompletedEvent } from '@contracts/events';
import { AutonomousTriggerService } from '../../autonomous/autonomous-trigger.service.js';
import { AutonomousRunCoordinatorService } from '../../autonomous/autonomous-run-coordinator.service.js';

@Injectable()
export class TaskCompletedAutonomousListener implements OnModuleInit {
  private readonly logger = new Logger(TaskCompletedAutonomousListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly triggers: AutonomousTriggerService,
    private readonly runCoordinator: AutonomousRunCoordinatorService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskCompletedEvent>(
      'task.completed',
      this.handle.bind(this),
      {
        queue: 'worker-task-completed-autonomous',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: TaskCompletedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    if (!companyId) return;
    if (!(await this.triggers.shouldRun(companyId, 'task_completed'))) {
      this.logger.debug('task.completed autonomous skipped (cooldown)', { companyId });
      return;
    }
    const tickAt = new Date().toISOString();
    await this.runCoordinator.runEventTriggeredCycle({
      companyId,
      tickAt,
      triggerSource: 'task_completed',
      triggerRef: event.data.taskId,
    });
  }
}
