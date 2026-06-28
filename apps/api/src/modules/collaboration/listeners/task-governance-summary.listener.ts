import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { BaseEvent } from '@contracts/events';
import { ChatMessageService } from '../services/chat-message.service.js';
import { TaskGovernanceSummaryService } from '../services/task-governance-summary.service.js';
import { CollaborationRoleRoutingService } from '../services/collaboration-role-routing.service.js';

type TaskGovernanceSummaryGeneratedEvent = BaseEvent & {
  data?: {
    audience?: 'supervisor' | 'director' | 'ceo';
    roomId?: string;
    items?: Array<{
      taskId: string;
      status: string;
      progress: number | null;
      blockedReason?: string | null;
      reportFlow: string;
      visibilityScope: 'department' | 'executive';
    }>;
    sourceEventId?: string | null;
  };
};

@Injectable()
export class TaskGovernanceSummaryListener implements OnModuleInit {
  private readonly logger = new Logger(TaskGovernanceSummaryListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly messages: ChatMessageService,
    private readonly summaryService: TaskGovernanceSummaryService,
    private readonly roleRouting: CollaborationRoleRoutingService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskGovernanceSummaryGeneratedEvent>(
      'task.governance_summary.generated',
      this.handle.bind(this),
      {
        queue: 'api-collab-task-governance-summary-generated',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private workerActorUserId(): string {
    return (
      process.env.WORKER_ACTOR_USER_ID?.trim() ||
      process.env.FOUNDRY_WORKER_ACTOR_USER_ID?.trim() ||
      '00000000-0000-0000-0000-000000000000'
    );
  }

  private async handle(event: TaskGovernanceSummaryGeneratedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.companyId;
    const data = event.data ?? {};
    const roomId = String(data.roomId ?? '').trim();
    if (!companyId || !roomId) return;

    const audience = data.audience ?? 'supervisor';
    const content = this.summaryService.buildSummary({
      audience,
      items: Array.isArray(data.items) ? data.items : [],
    });

    const visibilityScope = this.roleRouting.resolveVisibilityScope({
      principalRole: audience === 'ceo' ? 'ceo' : 'supervisor',
      routeTarget: audience === 'ceo' ? 'company' : 'department',
      isEscalation: audience === 'ceo',
    });

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.messages.appendSystemMessageAsActor(
          companyId,
          roomId,
          this.workerActorUserId(),
          content.slice(0, 4000),
          {
            source: 'task_governance_summary_generated',
            audience,
            visibilityScope,
            sourceEventId: event.eventId,
          },
        );
      } catch (e: unknown) {
        this.logger.warn('task_governance_summary.append_failed', {
          companyId,
          roomId,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
