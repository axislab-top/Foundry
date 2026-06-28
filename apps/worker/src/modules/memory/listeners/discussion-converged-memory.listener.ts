import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type {
  CollaborationDiscussionConvergedEvent,
  CollaborationMemoryConsolidateRequestedEvent,
} from '@contracts/events';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import { ExperienceLearnerService } from '../services/experience-learner.service.js';

/**
 * 讨论收敛后触发记忆 consolidation（与 collaboration.memory.consolidate.requested 对齐）。
 */
@Injectable()
export class DiscussionConvergedMemoryListener implements OnModuleInit {
  private readonly logger = new Logger(DiscussionConvergedMemoryListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly experienceLearner: ExperienceLearnerService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CollaborationDiscussionConvergedEvent>(
      'collaboration.discussion.converged',
      this.handle.bind(this),
      {
        queue: 'worker-collab-discussion-converged-memory-queue',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(event: CollaborationDiscussionConvergedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event);
    if (!companyId) return;
    const { roomId, threadId } = event.data;
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const req: CollaborationMemoryConsolidateRequestedEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.memory.consolidate.requested',
        aggregateId: roomId,
        aggregateType: 'chat_room',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          roomId,
          trigger: 'manual',
          sourceMessageId: threadId,
          requestedAt: new Date().toISOString(),
        },
      };
      try {
        await this.messaging.publish(req, {
          routingKey: req.eventType,
          persistent: true,
        });
      } catch (e: unknown) {
        this.logger.warn('publish consolidate after discussion converged failed', {
          message: e instanceof Error ? e.message : String(e),
        });
      }

      // Fire-and-forget: recap generation should not block consolidation.
      void this.experienceLearner.generateRecap({
        ...event,
        companyId,
        data: { ...event.data, threadId },
      });
    });
  }
}
