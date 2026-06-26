import type { BaseEvent } from './base-event.js';

export interface ScheduledPlaybookRunEnqueuedEvent extends BaseEvent {
  eventType: 'scheduled_playbook.run.enqueued';
  aggregateType: 'scheduled_playbook';
  data: {
    scheduleId: string;
    companyId: string;
    taskId: string;
    runAt: string;
    scheduleName: string;
  };
}

export interface ScheduledPlaybookRunCompletedEvent extends BaseEvent {
  eventType: 'scheduled_playbook.run.completed';
  aggregateType: 'scheduled_playbook';
  data: {
    scheduleId: string;
    companyId: string;
    taskId: string;
    status: 'succeeded' | 'failed';
    scheduleName: string;
  };
}

export type ScheduledPlaybookEventMap = {
  'scheduled_playbook.run.enqueued': ScheduledPlaybookRunEnqueuedEvent;
  'scheduled_playbook.run.completed': ScheduledPlaybookRunCompletedEvent;
};
