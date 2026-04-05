import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { TaskCompletedEvent } from '@contracts/events';
import { AutonomousOrchestratorService } from '../../autonomous/autonomous-orchestrator.service.js';
import { AutonomousTriggerService } from '../../autonomous/autonomous-trigger.service.js';

@Injectable()
export class TaskCompletedAutonomousListener implements OnModuleInit {
  private readonly logger = new Logger(TaskCompletedAutonomousListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly autonomous: AutonomousOrchestratorService,
    private readonly triggers: AutonomousTriggerService,
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
    if (!this.triggers.shouldRun(companyId, 'task_completed')) {
      this.logger.debug('task.completed autonomous skipped (cooldown)', { companyId });
      return;
    }
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const tickAt = new Date().toISOString();
      try {
        await this.autonomous.runHeartbeat(companyId, tickAt, {
          triggerSource: 'task_completed',
          triggerRef: event.data.taskId,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('runHeartbeat after task.completed failed', { companyId, message });
      }
    });
  }
}
