import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from '../../../common/cache/redis-cache.service.js';
import { ConfigService } from '../../../common/config/config.service.js';

export type CollaborationHeavyLeasePayload = {
  messageId: string;
  traceId: string;
  roomId: string;
  updatedAt: string;
};

/**
 * 主群重度协作占用信号：Redis 短 TTL KV，供自治 CEO LangGraph（心跳）与计时巡检让路。
 */
@Injectable()
export class CollaborationSessionLeaseService {
  private readonly logger = new Logger(CollaborationSessionLeaseService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redisCache: RedisCacheService,
  ) {}

  private key(companyId: string): string {
    const p = this.config.getRedisKeyPrefix().trim();
    const prefix = p ? `${p}:` : '';
    return `${prefix}collab:heavy_session:${String(companyId).trim()}`;
  }

  /**
   * 刷新租约（幂等）：进入 strategy 栈前调用。
   */
  async touchHeavyCollaborationLease(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    traceId: string;
  }): Promise<void> {
    if (!this.config.isCollabSessionLeaseEnabled()) return;
    const url = this.config.getRedisUrl();
    if (!url?.trim()) {
      this.logger.debug('collab.session_lease.skip_no_redis', {
        companyId: params.companyId,
        messageId: params.messageId,
      });
      return;
    }
    const payload: CollaborationHeavyLeasePayload = {
      messageId: String(params.messageId ?? '').trim(),
      traceId: String(params.traceId ?? '').trim(),
      roomId: String(params.roomId ?? '').trim(),
      updatedAt: new Date().toISOString(),
    };
    const ok = await this.redisCache.setPx(
      this.key(params.companyId),
      JSON.stringify(payload),
      this.config.getCollabSessionLeaseTtlMs(),
    );
    if (ok) {
      this.logger.log('collab.session_lease.touch', {
        companyId: params.companyId,
        roomId: payload.roomId,
        messageId: payload.messageId,
        traceId: payload.traceId,
      });
    }
  }

  /**
   * 主群管线结束时释放（匹配 messageId 才删除，避免误删下一轮）。
   */
  async clearHeavyCollaborationLease(companyId: string, messageId: string): Promise<void> {
    if (!this.config.isCollabSessionLeaseEnabled()) return;
    const key = this.key(companyId);
    const raw = await this.redisCache.get(key);
    if (!raw?.trim()) return;
    try {
      const parsed = JSON.parse(raw) as CollaborationHeavyLeasePayload;
      if (String(parsed.messageId ?? '').trim() === String(messageId ?? '').trim()) {
        await this.redisCache.del(key);
        this.logger.log('collab.session_lease.cleared', { companyId, messageId });
      }
    } catch {
      await this.redisCache.del(key);
    }
  }

  async isHeavyCollaborationLeaseActive(companyId: string): Promise<boolean> {
    if (!this.config.isCollabSessionLeaseEnabled()) return false;
    if (!this.config.getRedisUrl()?.trim()) return false;
    const raw = await this.redisCache.get(this.key(companyId));
    return Boolean(raw?.trim());
  }
}
