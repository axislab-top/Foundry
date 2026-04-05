import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CollaborationRoomSummaryGeneratedEvent } from '@contracts/events';
import { MemoryService } from '../services/memory.service.js';
import { companyNamespace } from '../utils/memory-namespace.js';

/** 群聊摘要生成后写入公司级长期记忆 */
@Injectable()
export class CollaborationRoomSummaryMemoryListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationRoomSummaryMemoryListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly memory: MemoryService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CollaborationRoomSummaryGeneratedEvent>(
      'collaboration.room.summary.generated',
      this.handle.bind(this),
      {
        queue: 'api-collab-room-summary-memory',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(
    event: CollaborationRoomSummaryGeneratedEvent,
  ): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.companyId;
    if (!companyId) return;
    const summary = event.data.summary?.trim();
    if (!summary) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.memory.storeEntry({
          companyId,
          namespace: companyNamespace(),
          collectionLabel: 'Room summaries',
          content: summary,
          sourceType: 'summary',
          sourceRef: null,
          metadata: {
            roomId: event.data.roomId,
            messageCount: event.data.messageCount,
            generatedAt: event.data.generatedAt,
            memoryKind: 'room_summary',
          },
          skipAccessCheck: true,
        });
      } catch (e: any) {
        this.logger.warn('store room summary to memory failed', {
          message: e?.message,
          roomId: event.data.roomId,
        });
      }
    });
  }
}
