import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { CollaborationMemberAutoJoinedEvent } from '@contracts/events';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';

@Injectable()
export class CollaborationMemberAutoJoinedListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationMemberAutoJoinedListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly monitoring: MonitoringService,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<CollaborationMemberAutoJoinedEvent>(
      'collaboration.member.auto_joined',
      this.handle.bind(this),
      {
        queue: 'worker-collaboration-member-auto-joined-queue',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: CollaborationMemberAutoJoinedEvent): Promise<void> {
    const started = Date.now();
    const dept = event.data.organizationNodeId ? 'node' : 'agent';
    try {
      this.monitoring.recordCollaborationAutoJoinedOutcome('success', dept);
      this.monitoring.observeCollaborationAutoJoinedSeconds(dept, (Date.now() - started) / 1000);
    } catch (e: unknown) {
      this.monitoring.recordCollaborationAutoJoinedOutcome('fail', dept);
      this.logger.warn('record auto_joined metric failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
