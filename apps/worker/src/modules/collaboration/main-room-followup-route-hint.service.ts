import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';
import { RedisCacheService } from '../../common/cache/redis-cache.service.js';
import { planningContinuityHintKey } from '@contracts/types/collab-redis-keys';
import { COLLAB_LLM_TRACE } from '../../common/logging/collab-llm-trace.util.js';

const HINT_TTL_MS = 900_000;

/**
 * 主群 natural upgrade：Redis 一次性 planning_continuity_hint，下一轮 pipeline 消费并拼入 Intent。
 */
@Injectable()
export class MainRoomFollowupRouteHintService {
  private readonly logger = new Logger(MainRoomFollowupRouteHintService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redisCache: RedisCacheService,
  ) {}

  private cacheKey(companyId: string, roomId: string, threadId: string): string {
    return planningContinuityHintKey(this.config.getRedisKeyPrefix(), companyId, roomId, threadId);
  }

  async scheduleOrchestrationFollowup(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    hintLine?: string;
  }): Promise<void> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId) return;
    const tid = ((params.threadId ?? '').trim() || 'main') as string;
    const line =
      String(params.hintLine ?? '').trim() ||
      '上一轮助手回复已引导讨论目标或规划；若用户继续围绕 OKR/计划/里程碑发言，请归类为 strategy 或 orchestration（非 quick），requiresParallelism/shouldExecute 按语义酌定，勿无故审批。';
    const payload = JSON.stringify({ line, createdAt: new Date().toISOString() });
    const ok = await this.redisCache.setPx(this.cacheKey(companyId, roomId, tid), payload, HINT_TTL_MS);
    if (ok) {
      this.logger.debug(`${COLLAB_LLM_TRACE} | planning_continuity_hint.scheduled`, {
        companyId,
        roomId,
        threadId: tid,
      });
    }
  }

  async consumeFollowupHint(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
  }): Promise<string | null> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId) return null;
    const tid = ((params.threadId ?? '').trim() || 'main') as string;
    const raw = await this.redisCache.getDel(this.cacheKey(companyId, roomId, tid));
    return this.parseFollowupHintPayload(raw);
  }

  /**
   * Read planning continuity hint without deleting it (e.g. internal audience-routing preview).
   */
  async peekFollowupHint(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
  }): Promise<string | null> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId) return null;
    const tid = ((params.threadId ?? '').trim() || 'main') as string;
    const raw = await this.redisCache.get(this.cacheKey(companyId, roomId, tid));
    return this.parseFollowupHintPayload(raw);
  }

  private parseFollowupHintPayload(raw: string | null): string | null {
    if (!raw) return null;
    try {
      const j = JSON.parse(String(raw)) as { line?: string };
      const line = typeof j?.line === 'string' ? j.line.trim() : '';
      return line || null;
    } catch {
      return null;
    }
  }
}
