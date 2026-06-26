import { Injectable, Logger } from '@nestjs/common';
import { CollabRedisCacheService } from '../../common/cache/collab-redis-cache.service.js';

export const COLLAB_NOTIFY_CHANNEL = 'collab:notify';

/** Worker → Redis `collab:notify` → Gateway WebSocket（与 API `CollaborationRealtimePublisher` 对齐） */
@Injectable()
export class CollabNotifyPublisherService {
  private readonly logger = new Logger(CollabNotifyPublisherService.name);

  constructor(private readonly collabRedis: CollabRedisCacheService) {}

  async publishEnvelope(payload: Record<string, unknown>): Promise<void> {
    try {
      const ok = await this.collabRedis.publish(
        COLLAB_NOTIFY_CHANNEL,
        JSON.stringify({ v: 1, ...payload }),
      );
      if (!ok) {
        this.logger.debug('collab_notify.publish_skipped', {
          event: payload.event,
          companyId: payload.companyId,
          roomId: payload.roomId,
        });
      }
    } catch (e: unknown) {
      this.logger.warn('collab_notify.publish_failed', {
        event: payload.event,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async publishDispatchPlanDraftUpdated(params: {
    companyId: string;
    roomId: string;
    updatedAt: string;
    planRevision?: number | null;
    threadId?: string | null;
  }): Promise<void> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId) return;
    await this.publishEnvelope({
      companyId,
      roomId,
      event: 'dispatch_plan_draft:updated',
      kind: 'dispatch_plan',
      updatedAt: params.updatedAt,
      planRevision: params.planRevision ?? null,
      threadId: String(params.threadId ?? '').trim() || 'main',
    });
  }

  async publishDispatchPartialFailed(params: {
    companyId: string;
    roomId: string;
    messageId?: string | null;
    skipped: Array<{ departmentSlug: string; reason: string; planTaskId?: string }>;
  }): Promise<void> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId || !params.skipped.length) return;
    await this.publishEnvelope({
      companyId,
      roomId,
      event: 'dispatch:partial_failed',
      messageId: params.messageId ?? null,
      skipped: params.skipped.slice(0, 24),
    });
  }
}
