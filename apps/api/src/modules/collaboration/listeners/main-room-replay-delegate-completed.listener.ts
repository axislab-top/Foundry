import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import type { CollaborationReplayDelegateCompletedEvent } from '@contracts/events';
import { WorkerReplayDecisionIngestService } from '../replay/worker-replay-decision-ingest.service.js';

@Injectable()
export class MainRoomReplayDelegateCompletedListener implements OnModuleInit {
  private readonly logger = new Logger(MainRoomReplayDelegateCompletedListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly ingest: WorkerReplayDecisionIngestService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CollaborationReplayDelegateCompletedEvent>(
      'collaboration.replay.delegate.completed',
      this.handle.bind(this),
      {
        queue: 'api-main-room-replay-delegate-completed',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: CollaborationReplayDelegateCompletedEvent): Promise<void> {
    const companyId = String(event.companyId ?? '').trim();
    if (!companyId) return;
    try {
      await this.tenantContext.runWithCompanyId(companyId, async () => {
        await this.ingest.ingest(event);
      });
    } catch (e: unknown) {
      this.logger.warn('main_room.replay_delegate_completed.ingest_failed', {
        companyId,
        messageId: event.data?.messageId,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }
}
