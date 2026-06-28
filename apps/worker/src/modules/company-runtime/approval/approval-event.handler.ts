import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ApprovalStatusChangedEvent } from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { ApprovalGateService } from './approval-gate.service.js';

@Injectable()
export class ApprovalEventHandler implements OnModuleInit {
  private readonly logger = new Logger(ApprovalEventHandler.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly approvalGateService: ApprovalGateService,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<ApprovalStatusChangedEvent>(
      'approval.status.changed',
      this.handleApprovalStatusChanged.bind(this),
      {
        queue: 'worker-company-runtime-approval-status-queue',
        durable: true,
        prefetchCount: 20,
        retry: {
          enabled: true,
          maxAttempts: 5,
          initialDelayMs: 1000,
          backoffFactor: 2,
          maxDelayMs: 60_000,
        },
      },
    );
  }

  private async handleApprovalStatusChanged(event: ApprovalStatusChangedEvent): Promise<void> {
    const { status, approvalRequestId, actionType, reason, resolvedBy, executionTokenId } = event.data;
    if (!(status === 'approved' || status === 'rejected' || status === 'expired')) {
      return;
    }

    const decision = {
      eventId: event.eventId,
      companyId: event.companyId,
      approvalRequestId,
      status,
      actionType: actionType ?? null,
      reason,
      resolvedBy,
      executionTokenId: executionTokenId ?? null,
    };

    try {
      await this.approvalGateService.processDecision(decision);
    } catch (e: unknown) {
      this.logger.error('approval.status.changed handling failed', {
        companyId: event.companyId,
        approvalRequestId,
        status,
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }
}
