import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { CollaborationModeChangedEvent } from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { RoomContextService } from '../context/room-context.service.js';

/**
 * `collaboration.mode.changed` → 失效 Worker 内存中的 RoomContext 缓存，避免切换 Ask/Agent 后短时间内误用旧快照。
 */
@Injectable()
export class CollaborationModeRoomContextListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationModeRoomContextListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly roomContext: RoomContextService,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<CollaborationModeChangedEvent>(
      'collaboration.mode.changed',
      async (event) => this.handle(event),
      {
        queue: 'worker-collab-room-context-mode-cache',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: CollaborationModeChangedEvent): Promise<void> {
    const companyId = String(event.companyId ?? '').trim();
    const roomId = String(event?.data?.roomId ?? '').trim();
    if (!companyId || !roomId) {
      this.logger.debug('collaboration_mode.cache_invalidate_skip_missing_ids', {
        hasCompanyId: Boolean(companyId),
        hasRoomId: Boolean(roomId),
      });
      return;
    }
    this.roomContext.invalidateCachesForRoom(companyId, roomId);
  }
}
