import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import type { AutonomousCeoApprovalRequiredEvent } from '@contracts/events';
import { CollaborationApprovalNotifier } from '../services/collaboration-approval-notifier.service.js';

@Injectable()
export class AutonomousCeoApprovalListener implements OnModuleInit {
  private readonly logger = new Logger(AutonomousCeoApprovalListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly approval: CollaborationApprovalNotifier,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<AutonomousCeoApprovalRequiredEvent>(
      'autonomous.ceo.approval.required',
      this.handle.bind(this),
      {
        queue: 'api-autonomous-ceo-approval',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: AutonomousCeoApprovalRequiredEvent): Promise<void> {
    const { companyId, roomId, agentId, reason, approvalId, metadata } = event.data;
    try {
      await this.tenantContext.runWithCompanyId(companyId, async () => {
        await this.approval.pushToRoom({
          companyId,
          roomId,
          agentId,
          reason,
          approvalId,
          metadata,
        });
      });
    } catch (e: unknown) {
      this.logger.warn('autonomous CEO approval push failed', {
        companyId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
