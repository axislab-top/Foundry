import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type {
  CollaborationRoomMemberJoinedEvent,
  CollaborationRoomMemberLeftEvent,
} from '@contracts/events';

@Injectable()
export class CollaborationRoomMemberListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationRoomMemberListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CollaborationRoomMemberJoinedEvent>(
      'collaboration.room.member.joined',
      (e) => this.withTenant(e, () => this.onJoined(e)),
      { queue: 'worker-collab-member-joined', durable: true, prefetchCount: 20 },
    );
    this.messaging.subscribeWithBackoff<CollaborationRoomMemberLeftEvent>(
      'collaboration.room.member.left',
      (e) => this.withTenant(e, () => this.onLeft(e)),
      { queue: 'worker-collab-member-left', durable: true, prefetchCount: 20 },
    );
  }

  private async withTenant(
    event: { companyId?: string },
    fn: () => Promise<void>,
  ): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.companyId;
    if (!companyId) return;
    await this.tenantContext.runWithCompanyId(companyId, fn);
  }

  private async onJoined(event: CollaborationRoomMemberJoinedEvent): Promise<void> {
    this.logger.debug('room.member.joined', event.data);
  }

  private async onLeft(event: CollaborationRoomMemberLeftEvent): Promise<void> {
    this.logger.debug('room.member.left', event.data);
  }
}
