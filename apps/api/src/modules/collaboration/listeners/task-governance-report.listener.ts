import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { BaseEvent } from '@contracts/events';
import { ChatMessageService } from '../services/chat-message.service.js';

type TaskGovernanceReportEvent = BaseEvent & {
  data?: {
    taskId?: string;
    parentTaskId?: string | null;
    reportFlow?: string;
    reportedByUserId?: string | null;
    reportedAt?: string;
    progress?: number;
    status?: string;
    reportToTaskId?: string | null;
    escalationRequired?: boolean;
    blockedReason?: string | null;
    sourceRoomId?: string | null;
  };
};

@Injectable()
export class TaskGovernanceReportListener implements OnModuleInit {
  private readonly logger = new Logger(TaskGovernanceReportListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly messages: ChatMessageService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskGovernanceReportEvent>(
      'task.report.generated',
      this.handle.bind(this),
      {
        queue: 'api-collab-task-report-generated',
        durable: true,
        prefetchCount: 20,
      },
    );
    this.messaging.subscribeWithBackoff<TaskGovernanceReportEvent>(
      'task.escalation.requested',
      this.handle.bind(this),
      {
        queue: 'api-collab-task-escalation-requested',
        durable: true,
        prefetchCount: 20,
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

  private resolveAudience(isEscalation: boolean): string[] {
    return isEscalation ? ['director', 'ceo', 'supervisor'] : ['supervisor'];
  }

  private resolveVisibilityScope(isEscalation: boolean): 'company' | 'department' | 'executive' {
    return isEscalation ? 'executive' : 'department';
  }

  private formatContent(params: {
    taskId: string;
    status: string;
    progress: string;
    isEscalation: boolean;
    blockedReason?: string | null;
    reportFlow?: string | null;
  }): string {
    const header = params.isEscalation ? '【任务升级】' : '【任务汇报】';
    const body = params.isEscalation
      ? `任务 ${params.taskId} 当前状态：${params.status}，进度：${params.progress}。阻塞原因：${String(params.blockedReason ?? '未填写').slice(0, 800)}。请主管/CEO 关注并协助处理。`
      : `任务 ${params.taskId} 当前状态：${params.status}，进度：${params.progress}。请直属主管查看。`;
    const flow = params.reportFlow ? ` 流程：${params.reportFlow}。` : '';
    return `${header}${body}${flow}`;
  }

  private async handle(event: TaskGovernanceReportEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.companyId;
    const data = event.data ?? {};
    const roomId = String(data.sourceRoomId ?? '').trim();
    const taskId = String(data.taskId ?? '').trim();
    if (!companyId || !roomId || !taskId) return;

    const isEscalation =
      event.eventType === 'task.escalation.requested' ||
      (event.eventType === 'task.report.generated' && Boolean(data.escalationRequired));
    const progress = typeof data.progress === 'number' ? `${data.progress}%` : '未知进度';
    const status = data.status ? String(data.status) : 'unknown';
    const content = this.formatContent({
      taskId,
      status,
      progress,
      isEscalation,
      blockedReason: data.blockedReason ?? null,
      reportFlow: data.reportFlow ?? null,
    });

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.messages.appendSystemMessageAsActor(
          companyId,
          roomId,
          this.workerActorUserId(),
          content.slice(0, 4000),
          {
            source: isEscalation ? 'task_escalation_requested' : 'task_report_generated',
            audienceRoles: this.resolveAudience(isEscalation),
            visibilityScope: this.resolveVisibilityScope(isEscalation),
            taskId,
            parentTaskId: data.parentTaskId ?? null,
            reportFlow: data.reportFlow ?? null,
            reportToTaskId: data.reportToTaskId ?? null,
            reportedByUserId: data.reportedByUserId ?? null,
            reportedAt: data.reportedAt ?? null,
            escalationRequired: isEscalation,
            sourceEventId: event.eventId,
          },
        );
      } catch (e: unknown) {
        this.logger.warn('task_governance_report.append_failed', {
          companyId,
          roomId,
          taskId,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
