import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { TaskCompletedEvent } from '@contracts/events';
import { Repository } from 'typeorm';
import { ChatMessageService } from '../../collaboration/services/chat-message.service.js';
import { ChatRoomService } from '../../collaboration/services/chat-room.service.js';
import { CompanyScheduledPlaybook } from '../entities/company-scheduled-playbook.entity.js';

@Injectable()
export class ScheduledPlaybookCompletedListener implements OnModuleInit {
  private readonly logger = new Logger(ScheduledPlaybookCompletedListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    @InjectRepository(CompanyScheduledPlaybook)
    private readonly repo: Repository<CompanyScheduledPlaybook>,
    private readonly chatMessages: ChatMessageService,
    private readonly chatRooms: ChatRoomService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskCompletedEvent>(
      'task.completed',
      this.handle.bind(this),
      {
        queue: 'api-scheduled-playbook-completed',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private internalActor() {
    return { id: '00000000-0000-0000-0000-000000000001', roles: ['admin'] as string[] };
  }

  private async handle(event: TaskCompletedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    const taskId = event.data?.taskId;
    if (!companyId || !taskId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const scheduleId = await this.resolveScheduleId(companyId, taskId);
      if (!scheduleId) return;

      const schedule = await this.repo.findOne({ where: { id: scheduleId, companyId } });
      if (!schedule || schedule.deliveryChannel !== 'main_room') return;

      schedule.lastRunStatus = 'succeeded';
      await this.repo.save(schedule);

      try {
        const mainRoom = await this.chatRooms.findMainRoom(companyId);
        if (!mainRoom) return;

        const actor = this.internalActor();
        const summary = `定时 Playbook「${schedule.name}」已完成执行。`;
        await this.chatMessages.appendSystemMessageAsActor(
          companyId,
          mainRoom.id,
          actor.id,
          summary,
          {
            richCard: {
              kind: 'task',
              taskId,
              cardType: 'scheduled_playbook_complete',
              scheduleId: schedule.id,
              scheduleName: schedule.name,
            },
            scheduledPlaybookId: schedule.id,
          },
        );
      } catch (e: unknown) {
        this.logger.warn('scheduled playbook main room notify failed', {
          companyId,
          scheduleId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  private async resolveScheduleId(companyId: string, taskId: string): Promise<string | null> {
    const schedule = await this.repo.findOne({
      where: { companyId, lastTaskId: taskId },
    });
    return schedule?.id ?? null;
  }
}
