import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CollaborationTaskExtractedEvent } from '@contracts/events';
import { ChatRoom } from '../../collaboration/entities/chat-room.entity.js';
import { MemoryService } from '../services/memory.service.js';
import {
  companyNamespace,
  departmentNamespace,
} from '../utils/memory-namespace.js';

/** 群聊抽取的任务候选写入公司级 / 部门级任务记忆 */
@Injectable()
export class CollaborationTaskExtractedMemoryListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationTaskExtractedMemoryListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly memory: MemoryService,
    @InjectRepository(ChatRoom)
    private readonly roomsRepo: Repository<ChatRoom>,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CollaborationTaskExtractedEvent>(
      'collaboration.task.extracted',
      this.handle.bind(this),
      {
        queue: 'api-collab-task-memory',
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handle(event: CollaborationTaskExtractedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const room = await this.roomsRepo.findOne({
        where: { id: event.data.roomId, companyId },
      });
      if (!room) return;

      const title = event.data.title?.trim();
      const desc = event.data.description?.trim();
      const content = [title && `标题: ${title}`, desc && `说明: ${desc}`]
        .filter(Boolean)
        .join('\n');
      if (!content) return;

      const namespace = room.organizationNodeId
        ? departmentNamespace(room.organizationNodeId)
        : companyNamespace();

      try {
        await this.memory.storeEntry({
          companyId,
          namespace,
          collectionLabel: 'Tasks from chat',
          content,
          sourceType: 'task',
          sourceRef: undefined,
          metadata: {
            roomId: event.data.roomId,
            sourceMessageId: event.data.sourceMessageId,
            extractedAt: event.data.extractedAt,
          },
          skipAccessCheck: true,
        });
      } catch (e: any) {
        this.logger.warn('task memory store failed', { message: e?.message });
      }
    });
  }
}
