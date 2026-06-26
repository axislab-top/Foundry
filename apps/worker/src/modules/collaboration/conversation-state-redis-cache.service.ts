import { Injectable, Logger } from '@nestjs/common';
import { createClient } from 'redis';
import { ConfigService } from '../../common/config/config.service.js';
import { COLLAB_LLM_TRACE } from '../../common/logging/collab-llm-trace.util.js';
import type { PendingMentionEntry } from './ceo/dto/ceo-v2-pipeline.types.js';
import { parsePendingMentions } from './ceo/mention-intent-moe.util.js';

/** Sprint 2 / 架构：conversation_state 热读路径 — Redis 60s，减轻 memory.search 压力 */
const DEFAULT_TTL_MS = 60_000;

export type CachedConversationStateSnapshot = {
  currentRound: number;
  /**
   * 部门 slug 列表（SSOT）；与 legacy `waitingForAgentIds` 二选一或同值传入。
   * 读路径优先本字段，缺省时回退 `waitingForAgentIds`。
   */
  waitingForDepartmentSlugs?: string[];
  /** @deprecated 语义为部门 slug；请优先写 `waitingForDepartmentSlugs` */
  waitingForAgentIds?: string[];
  /** 状态块 / 等待队列变更时间（ISO） */
  updatedAt: string;
  /** 与 `updatedAt` 对齐；显式区分于「最后用户发言时间」 */
  stateUpdatedAt?: string;
  /** 最后一条人类用户消息时间（可选；未写入时消费者勿与 stateUpdatedAt 混用） */
  lastUserMessageAt?: string | null;
  pendingMentions: Record<string, PendingMentionEntry>;
};

@Injectable()
export class ConversationStateRedisCacheService {
  private readonly logger = new Logger(ConversationStateRedisCacheService.name);
  private client: ReturnType<typeof createClient> | null = null;
  private connecting: Promise<void> | null = null;

  constructor(private readonly config: ConfigService) {}

  private normalizeSlugs(snapshot: CachedConversationStateSnapshot): string[] {
    const fromPrimary = Array.isArray(snapshot.waitingForDepartmentSlugs)
      ? snapshot.waitingForDepartmentSlugs
      : [];
    const fromLegacy = Array.isArray(snapshot.waitingForAgentIds) ? snapshot.waitingForAgentIds : [];
    const raw = fromPrimary.length ? fromPrimary : fromLegacy;
    return [...new Set(raw.map((x) => String(x ?? '').trim()).filter(Boolean))].slice(0, 12);
  }

  private serializeSnapshot(snapshot: CachedConversationStateSnapshot): string {
    const slugs = this.normalizeSlugs(snapshot);
    const updatedAt = String(snapshot.updatedAt ?? '').trim();
    const stateUpdatedAt = String(snapshot.stateUpdatedAt ?? snapshot.updatedAt ?? '').trim() || updatedAt;
    const body: Record<string, unknown> = {
      currentRound: snapshot.currentRound,
      waitingForDepartmentSlugs: slugs,
      waitingForAgentIds: slugs,
      pendingMentions: snapshot.pendingMentions ?? {},
      updatedAt,
      stateUpdatedAt,
    };
    if (snapshot.lastUserMessageAt) body.lastUserMessageAt = snapshot.lastUserMessageAt;
    return JSON.stringify(body);
  }

  private cacheKey(companyId: string, roomId: string, threadId: string): string {
    const p = this.config.getRedisKeyPrefix();
    const prefix = p ? `${p}:` : '';
    const tid = threadId.trim() || 'main';
    return `${prefix}collab:conversation_state:v1:${companyId}:${roomId}:${tid}`;
  }

  private async ensureClient(): Promise<ReturnType<typeof createClient> | null> {
    const url = this.config.getRedisUrl();
    if (!url) return null;
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const c = createClient({ url });
        c.on('error', (e) => {
          this.logger.warn(`${COLLAB_LLM_TRACE} | conv_state_redis.error`, {
            message: String((e as { message?: string })?.message ?? e),
          });
        });
        await c.connect();
        this.client = c;
      })().catch((e) => {
        this.logger.warn(`${COLLAB_LLM_TRACE} | conv_state_redis.connect_failed`, {
          message: e instanceof Error ? e.message : String(e),
        });
      }) as Promise<void>;
    }
    await this.connecting;
    return this.client;
  }

  async getSnapshot(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
  }): Promise<CachedConversationStateSnapshot | null> {
    const companyId = String(params.companyId || '').trim();
    const roomId = String(params.roomId || '').trim();
    if (!companyId || !roomId) return null;
    const tid = ((params.threadId ?? '').trim() || 'main') as string;
    const redis = await this.ensureClient();
    if (!redis) return null;
    try {
      const raw = await redis.get(this.cacheKey(companyId, roomId, tid));
      if (!raw) return null;
      const j = JSON.parse(String(raw)) as Record<string, unknown>;
      const updatedAt = typeof j?.updatedAt === 'string' ? j.updatedAt : '';
      if (!updatedAt) return null;
      const currentRound = Number.isFinite(j?.currentRound as number)
        ? Math.max(1, Math.floor(Number(j.currentRound)))
        : 1;
      const fromDept = Array.isArray(j?.waitingForDepartmentSlugs)
        ? (j.waitingForDepartmentSlugs as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 12)
        : [];
      const fromLegacy = Array.isArray(j?.waitingForAgentIds)
        ? (j.waitingForAgentIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 12)
        : [];
      const waitingForDepartmentSlugs = fromDept.length ? fromDept : fromLegacy;
      const stateUpdatedAt =
        typeof j?.stateUpdatedAt === 'string' && j.stateUpdatedAt.trim()
          ? j.stateUpdatedAt.trim()
          : updatedAt;
      const lastUserMessageAt =
        typeof j?.lastUserMessageAt === 'string' && j.lastUserMessageAt.trim() ? j.lastUserMessageAt.trim() : undefined;
      const pendingMentions =
        j?.pendingMentions && typeof j.pendingMentions === 'object'
          ? parsePendingMentions(j.pendingMentions)
          : {};
      return {
        currentRound,
        waitingForDepartmentSlugs,
        waitingForAgentIds: waitingForDepartmentSlugs,
        updatedAt,
        stateUpdatedAt,
        lastUserMessageAt,
        pendingMentions,
      };
    } catch (e: unknown) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | conv_state_redis.get_failed`, {
        message: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  async setSnapshot(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    snapshot: CachedConversationStateSnapshot;
  }): Promise<void> {
    const companyId = String(params.companyId || '').trim();
    const roomId = String(params.roomId || '').trim();
    if (!companyId || !roomId) return;
    const tid = ((params.threadId ?? '').trim() || 'main') as string;
    const redis = await this.ensureClient();
    if (!redis) return;
    try {
      await redis.set(this.cacheKey(companyId, roomId, tid), this.serializeSnapshot(params.snapshot), {
        PX: DEFAULT_TTL_MS,
      });
    } catch (e: unknown) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | conv_state_redis.set_failed`, {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
