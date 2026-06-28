import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { TaskHeartbeatTickEvent } from '@contracts/events';
import { ScheduledPlaybookRunnerService } from '../services/scheduled-playbook-runner.service.js';
import { ScheduledPlaybookMetricsService } from '../services/scheduled-playbook-metrics.service.js';
import { ScheduledPlaybooksService } from '../services/scheduled-playbooks.service.js';

@Injectable()
export class ScheduledPlaybookTickListener implements OnModuleInit {
  private readonly logger = new Logger(ScheduledPlaybookTickListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly schedules: ScheduledPlaybooksService,
    private readonly runner: ScheduledPlaybookRunnerService,
    private readonly metrics: ScheduledPlaybookMetricsService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskHeartbeatTickEvent>(
      'task.heartbeat.tick',
      this.handle.bind(this),
      {
        queue: 'api-scheduled-playbook-tick',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(event: TaskHeartbeatTickEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    if (!companyId) return;
    const tickAt = event.data?.tickAt ?? event.occurredAt;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const due = await this.schedules.findDueSchedules(companyId, 20);
      if (!due.length) return;

      for (const schedule of due) {
        try {
          const result = await this.runner.enqueueRun(schedule, tickAt);
          if (result.enqueued) {
            this.metrics.recordRun('enqueued');
            this.logger.log('scheduled playbook enqueued', {
              companyId,
              scheduleId: schedule.id,
              taskId: result.taskId,
            });
          } else if (result.failed) {
            this.metrics.recordRun('failed');
          } else {
            this.metrics.recordRun('skipped');
          }
        } catch (e: unknown) {
          this.metrics.recordRun('failed');
          this.logger.warn('scheduled playbook tick failed', {
            companyId,
            scheduleId: schedule.id,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    });
  }
}
