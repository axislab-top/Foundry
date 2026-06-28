import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CollaborationMessageProcessFailedV2Event } from '@contracts/events';
import { ChatMessageService } from '../services/chat-message.service.js';

/**
 * Worker 处理协作消息失败时，向房间写入系统提示（用户通过 message:new 可见）。
 */
@Injectable()
export class CollaborationMessageProcessFailedListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationMessageProcessFailedListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly messages: ChatMessageService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CollaborationMessageProcessFailedV2Event>(
      'collaboration.message.process_failed.v2',
      this.handle.bind(this),
      {
        queue: 'api-collab-message-process-failed',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private workerActorUserId(): string {
    return (
      process.env.WORKER_ACTOR_USER_ID?.trim() ||
      process.env.FOUNDRY_WORKER_ACTOR_USER_ID?.trim() ||
      '00000000-0000-0000-0000-000000000000'
    );
  }

  private async handle(event: CollaborationMessageProcessFailedV2Event): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.companyId;
    const roomId = String(event.data?.roomId ?? '').trim();
    const messageId = String(event.data?.messageId ?? '').trim();
    const error = String(event.data?.error ?? 'unknown').trim().slice(0, 500);
    if (!companyId || !roomId || !messageId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.messages.appendSystemMessageAsActor(
          companyId,
          roomId,
          this.workerActorUserId(),
          `【处理失败】你的消息未能完成自动处理：${error}`.slice(0, 4000),
          {
            source: 'collaboration_message_process_failed',
            directReplyToMessageId: messageId,
            failedMessageId: messageId,
            traceId: event.data.traceId ?? null,
            failedAt: event.data.failedAt ?? new Date().toISOString(),
          },
        );
      } catch (e: unknown) {
        this.logger.warn('collaboration_message_process_failed.append_failed', {
          companyId,
          roomId,
          messageId,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
