import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { CacheService } from '../../../common/cache/cache.service.js';
import type { ScheduledPlaybookRunEnqueuedEvent } from '@contracts/events/scheduled-playbook.events.js';
import { TasksService } from '../../tasks/services/tasks.service.js';
import type { CompanyScheduledPlaybook } from '../entities/company-scheduled-playbook.entity.js';
import { ScheduledPlaybooksService } from './scheduled-playbooks.service.js';
import {
  computeNextRunAt,
  computeRunWindowKey,
  scheduleInputFromEntity,
} from '../utils/schedule-time.util.js';

@Injectable()
export class ScheduledPlaybookRunnerService {
  private readonly logger = new Logger(ScheduledPlaybookRunnerService.name);

  constructor(
    private readonly schedules: ScheduledPlaybooksService,
    private readonly tasksService: TasksService,
    private readonly cache: CacheService,
    private readonly messaging: MessagingService,
  ) {}

  private internalActor() {
    return { id: '00000000-0000-0000-0000-000000000001', roles: ['admin'] as string[] };
  }

  async enqueueRun(
    schedule: CompanyScheduledPlaybook,
    tickAt: string,
  ): Promise<{ enqueued: boolean; taskId?: string; failed?: boolean }> {
    const runAt = new Date(tickAt);
    const scheduleInput = scheduleInputFromEntity(schedule);
    const runWindowKey = computeRunWindowKey(scheduleInput, runAt);
    const idemKey = `scheduled-playbook:idem:${schedule.id}:${runWindowKey}`;

    const existing = await this.cache.get<string>(idemKey);
    if (existing) {
      this.logger.debug('scheduled playbook skipped (idempotent)', {
        scheduleId: schedule.id,
        runWindowKey,
      });
      return { enqueued: false };
    }

    const actor = this.internalActor();
    const playbookArgs = schedule.playbookArgs ?? {};
    const objective =
      typeof playbookArgs.objective === 'string'
        ? playbookArgs.objective
        : schedule.description ?? schedule.name;
    const playbookName =
      typeof playbookArgs.playbookName === 'string' ? playbookArgs.playbookName : schedule.name;

    try {
      const created = await this.tasksService.create(
        {
          title: `[定时] ${schedule.name}`,
          description: schedule.description ?? undefined,
          assigneeType: 'agent',
          assigneeId: schedule.assigneeAgentId,
          requiresHumanApproval: schedule.requiresHumanApproval,
          metadata: {
            skillName: schedule.skillName,
            scheduledPlaybookId: schedule.id,
            scheduledRunAt: runAt.toISOString(),
            triggerSource: 'schedule',
            deliveryChannel: schedule.deliveryChannel,
            playbookName,
            objective,
            ...playbookArgs,
          },
        },
        actor,
        { source: 'autonomous', trustedInternal: true },
      );

      const taskId = String((created as { id?: string }).id ?? '');
      const nextRunAt = computeNextRunAt(scheduleInput, runAt);
      await this.schedules.markRunState(schedule, {
        lastRunAt: runAt,
        lastTaskId: taskId,
        lastRunStatus: 'enqueued',
        nextRunAt,
      });

      await this.cache.set(idemKey, taskId, 24 * 60 * 60);

      await this.publishEnqueued(schedule, taskId, runAt.toISOString());

      return { enqueued: true, taskId };
    } catch (e: unknown) {
      this.logger.warn('scheduled playbook enqueue failed', {
        scheduleId: schedule.id,
        message: e instanceof Error ? e.message : String(e),
      });
      try {
        const nextRunAt = computeNextRunAt(scheduleInput, runAt);
        await this.schedules.markRunState(schedule, {
          lastRunAt: runAt,
          lastRunStatus: 'failed',
          nextRunAt,
        });
      } catch {
        // non-blocking
      }
      return { enqueued: false, failed: true };
    }
  }

  async triggerNow(companyId: string, scheduleId: string, actor: { id: string; roles?: string[] }) {
    const row = await this.schedules.getEntity(companyId, scheduleId, actor);
    return this.enqueueRun(row, new Date().toISOString());
  }

  private async publishEnqueued(
    schedule: CompanyScheduledPlaybook,
    taskId: string,
    runAt: string,
  ): Promise<void> {
    try {
      const event: ScheduledPlaybookRunEnqueuedEvent = {
        eventId: randomUUID(),
        eventType: 'scheduled_playbook.run.enqueued',
        aggregateId: schedule.id,
        aggregateType: 'scheduled_playbook',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: schedule.companyId,
        data: {
          scheduleId: schedule.id,
          companyId: schedule.companyId,
          taskId,
          runAt,
          scheduleName: schedule.name,
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'scheduled_playbook.run.enqueued',
        persistent: true,
      });
    } catch (e: unknown) {
      this.logger.warn('publish scheduled_playbook.run.enqueued failed', {
        scheduleId: schedule.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
