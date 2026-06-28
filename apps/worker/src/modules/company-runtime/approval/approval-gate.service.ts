import { Injectable, Logger } from '@nestjs/common';
import { PendingAgentTaskExecutionService } from '../../tasks/pending-agent-tasks.service.js';
import type { ApprovalDecision } from './interfaces/approval-decision.interface.js';

@Injectable()
export class ApprovalGateService {
  private readonly logger = new Logger(ApprovalGateService.name);
  private readonly processedKeys = new Set<string>();

  constructor(private readonly pendingTaskService: PendingAgentTaskExecutionService) {}

  async processDecision(event: ApprovalDecision): Promise<void> {
    const key = this.buildDedupKey(event);
    if (this.processedKeys.has(key)) {
      return;
    }

    if (
      event.actionType !== 'budget.autonomous.task.execute' &&
      event.actionType !== 'director.autonomous.subtask.execute' &&
      event.actionType !== 'employee.autonomous.subtask.execute' &&
      event.actionType !== 'cross.department.joint.approval'
    ) {
      this.processedKeys.add(key);
      this.logger.debug('approval actionType skipped', {
        approvalRequestId: event.approvalRequestId,
        actionType: event.actionType ?? null,
      });
      return;
    }

    if (event.status === 'approved') {
      await this.pendingTaskService.resumeAfterBudgetApproval({
        companyId: event.companyId,
        approvalRequestId: event.approvalRequestId,
        resolvedBy: event.resolvedBy,
        executionTokenId: event.executionTokenId ?? null,
      });
      this.processedKeys.add(key);
      return;
    }

    if (event.status === 'rejected' || event.status === 'expired') {
      await this.pendingTaskService.cancelAfterBudgetRejection({
        companyId: event.companyId,
        approvalRequestId: event.approvalRequestId,
        reason: event.reason,
        status: event.status,
        resolvedBy: event.resolvedBy,
      });
      this.processedKeys.add(key);
      return;
    }
  }

  private buildDedupKey(event: ApprovalDecision): string {
    const base = `${event.companyId}:${event.approvalRequestId}:${event.status}:${event.actionType ?? ''}`;
    if (event.eventId?.trim()) {
      return `${base}:${event.eventId.trim()}`;
    }
    return base;
  }
}
