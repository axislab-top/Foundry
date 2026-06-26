import { Injectable, Logger } from '@nestjs/common';
import type { MainRoomCeoTurnState } from '@contracts/types';
import { ConfigService } from '../../common/config/config.service.js';
import { RedisCacheService } from '../../common/cache/redis-cache.service.js';
import {
  mainRoomCeoAlignmentSessionKey,
  mainRoomCeoTurnStateKey,
  mainRoomStrategyDraftSessionKey,
} from '@contracts/types/collab-redis-keys';
import type { MainRoomStrategyDraftPayload } from './main-room-strategy-draft-session.service.js';
import type { MainRoomCeoAlignmentSessionPayload } from './main-room-ceo-alignment-session.service.js';

const TURN_STATE_TTL_MS = 86_400_000;

type SessionScope = {
  companyId: string;
  roomId: string;
  threadId?: string | null;
};

@Injectable()
export class MainRoomCeoTurnStateService {
  private readonly logger = new Logger(MainRoomCeoTurnStateService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redisCache: RedisCacheService,
  ) {}

  isUnifiedEnabled(): boolean {
    return this.config.isCollabCeoTurnStateUnifiedEnabled();
  }

  private threadId(threadId?: string | null): string {
    return ((threadId ?? '').trim() || 'main') as string;
  }

  private unifiedKey(scope: SessionScope): string {
    return mainRoomCeoTurnStateKey(
      this.config.getRedisKeyPrefix(),
      scope.companyId,
      scope.roomId,
      this.threadId(scope.threadId),
    );
  }

  private draftLegacyKey(scope: SessionScope): string {
    return mainRoomStrategyDraftSessionKey(
      this.config.getRedisKeyPrefix(),
      scope.companyId,
      scope.roomId,
      this.threadId(scope.threadId),
    );
  }

  private alignmentLegacyKey(scope: SessionScope): string {
    return mainRoomCeoAlignmentSessionKey(
      this.config.getRedisKeyPrefix(),
      scope.companyId,
      scope.roomId,
      this.threadId(scope.threadId),
    );
  }

  private async readUnified(scope: SessionScope): Promise<MainRoomCeoTurnState | null> {
    const raw = await this.redisCache.get(this.unifiedKey(scope));
    if (!raw) return null;
    try {
      const j = JSON.parse(String(raw)) as MainRoomCeoTurnState;
      if (j?.schemaVersion !== 1) return null;
      return j;
    } catch {
      return null;
    }
  }

  private async readLegacyDraft(scope: SessionScope): Promise<MainRoomStrategyDraftPayload | null> {
    const raw = await this.redisCache.get(this.draftLegacyKey(scope));
    if (!raw) return null;
    try {
      const j = JSON.parse(String(raw)) as MainRoomStrategyDraftPayload;
      const g = String(j?.draftGoalSummary ?? '').trim();
      if (!g) return null;
      return {
        draftGoalSummary: g.slice(0, 8000),
        updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : new Date().toISOString(),
        sourceMessageId: typeof j.sourceMessageId === 'string' ? j.sourceMessageId : undefined,
      };
    } catch {
      return null;
    }
  }

  private async readLegacyAlignment(scope: SessionScope): Promise<MainRoomCeoAlignmentSessionPayload | null> {
    const raw = await this.redisCache.get(this.alignmentLegacyKey(scope));
    if (!raw) return null;
    try {
      return JSON.parse(String(raw)) as MainRoomCeoAlignmentSessionPayload;
    } catch {
      return null;
    }
  }

  private mergeLegacyState(
    draft: MainRoomStrategyDraftPayload | null,
    alignment: MainRoomCeoAlignmentSessionPayload | null,
  ): MainRoomCeoTurnState | null {
    if (!draft && !alignment) return null;
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      ...(draft
        ? {
            draft: {
              draftGoalSummary: draft.draftGoalSummary,
              updatedAt: draft.updatedAt,
              sourceMessageId: draft.sourceMessageId,
            },
          }
        : {}),
      ...(alignment
        ? {
            alignment: {
              phase: alignment.phase,
              draftGoalSummary: alignment.draftGoalSummary,
              proposedHeavyPipelineKind: alignment.proposedHeavyPipelineKind,
              proposedAt: alignment.proposedAt,
              sourceMessageId: alignment.sourceMessageId,
              authorizationMessageId: alignment.authorizationMessageId,
              authorizedAt: alignment.authorizedAt,
            },
          }
        : {}),
    };
  }

  async loadState(scope: SessionScope): Promise<MainRoomCeoTurnState | null> {
    const companyId = String(scope.companyId ?? '').trim();
    const roomId = String(scope.roomId ?? '').trim();
    if (!companyId || !roomId) return null;
    const normalized = { companyId, roomId, threadId: scope.threadId };

    if (this.isUnifiedEnabled()) {
      const unified = await this.readUnified(normalized);
      if (unified) return unified;
    }

    const merged = this.mergeLegacyState(
      await this.readLegacyDraft(normalized),
      await this.readLegacyAlignment(normalized),
    );

    if (merged && this.isUnifiedEnabled()) {
      // 使用 SETNX 防止并发 migration 覆盖新鲜数据。
      // 如果 key 已存在（另一个并发 loadState 或 setDraft 已写入），SETNX 返回 false，跳过写入。
      await this.persistUnifiedIfAbsent(normalized, merged);
    }
    return merged;
  }

  private async persistUnified(scope: SessionScope, state: MainRoomCeoTurnState): Promise<void> {
    const companyId = String(scope.companyId ?? '').trim();
    const roomId = String(scope.roomId ?? '').trim();
    if (!companyId || !roomId) return;
    const payload: MainRoomCeoTurnState = {
      ...state,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    };
    const ok = await this.redisCache.setPx(this.unifiedKey(scope), JSON.stringify(payload), TURN_STATE_TTL_MS);
    if (!ok) {
      this.logger.warn('main_room.ceo_turn_state.persist_failed', {
        companyId,
        roomId,
        threadId: this.threadId(scope.threadId),
      });
    }
  }

  /** Migration 写入：仅当 key 不存在时写入（SETNX），防止并发 migration 覆盖新鲜数据。 */
  private async persistUnifiedIfAbsent(scope: SessionScope, state: MainRoomCeoTurnState): Promise<void> {
    const payload: MainRoomCeoTurnState = {
      ...state,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    };
    await this.redisCache.setNxPx(this.unifiedKey(scope), JSON.stringify(payload), TURN_STATE_TTL_MS);
  }

  private async dualWriteLegacy(scope: SessionScope, state: MainRoomCeoTurnState): Promise<void> {
    if (!this.config.isCollabCeoTurnStateLegacyDualWriteEnabled()) return;

    // 独立 try-catch：draft 写入失败不阻塞 alignment 写入，反之亦然。
    try {
      if (state.draft?.draftGoalSummary) {
        await this.redisCache.setPx(
          this.draftLegacyKey(scope),
          JSON.stringify({
            draftGoalSummary: state.draft.draftGoalSummary,
            updatedAt: state.draft.updatedAt,
            sourceMessageId: state.draft.sourceMessageId,
          } satisfies MainRoomStrategyDraftPayload),
          TURN_STATE_TTL_MS,
        );
      } else {
        await this.redisCache.del(this.draftLegacyKey(scope));
      }
    } catch (e: unknown) {
      this.logger.warn('main_room.ceo_turn_state.dual_write_draft_failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    try {
      if (state.alignment) {
        await this.redisCache.setPx(
          this.alignmentLegacyKey(scope),
          JSON.stringify(state.alignment as MainRoomCeoAlignmentSessionPayload),
          TURN_STATE_TTL_MS,
        );
      } else {
        await this.redisCache.del(this.alignmentLegacyKey(scope));
      }
    } catch (e: unknown) {
      this.logger.warn('main_room.ceo_turn_state.dual_write_alignment_failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async saveState(scope: SessionScope, state: MainRoomCeoTurnState): Promise<void> {
    if (this.isUnifiedEnabled()) {
      await this.persistUnified(scope, state);
      await this.dualWriteLegacy(scope, state);
      return;
    }
    await this.dualWriteLegacy(scope, state);
  }

  /**
   * 原子 CAS：Lua 脚本内完成 read → merge fields → write，避免并发 lost update。
   * @param fieldPatch JSON 编码的字段补丁；null 表示删除对应字段。
   * @returns 合并后的完整状态，或 null（key 不存在且 initIfAbsent=false）。
   */
  private async atomicMerge(
    scope: SessionScope,
    fieldPatch: Record<string, string | null>,
    initIfAbsent: boolean,
  ): Promise<MainRoomCeoTurnState | null> {
    const key = this.unifiedKey(scope);
    const lua = `
      local raw = redis.call('GET', KEYS[1])
      local state
      if raw then
        local ok, parsed = pcall(cjson.decode, raw)
        if ok and type(parsed) == 'table' then
          state = parsed
        end
      end
      if not state then
        if ARGV[2] == '1' then
          state = { schemaVersion = 1 }
        else
          return nil
        end
      end
      local patch = cjson.decode(ARGV[1])
      for k, v in pairs(patch) do
        if v == '__DEL__' then
          state[k] = cjson.null
        else
          state[k] = v
        end
      end
      state['schemaVersion'] = 1
      state['updatedAt'] = ARGV[3]
      local out = cjson.encode(state)
      redis.call('SET', KEYS[1], out, 'PX', tonumber(ARGV[4]))
      return out
    `;
    // 将 null 值替换为 sentinel，Lua 端识别后删除字段
    const patchForLua: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fieldPatch)) {
      patchForLua[k] = v === null ? '__DEL__' : JSON.parse(v);
    }
    const result = await this.redisCache.evalScript(
      lua,
      [key],
      [
        JSON.stringify(patchForLua),
        initIfAbsent ? '1' : '0',
        new Date().toISOString(),
        String(TURN_STATE_TTL_MS),
      ],
    );
    if (!result) return null;
    try {
      return JSON.parse(String(result)) as MainRoomCeoTurnState;
    } catch {
      return null;
    }
  }

  async getDraft(scope: SessionScope): Promise<MainRoomStrategyDraftPayload | null> {
    const state = await this.loadState(scope);
    const draft = state?.draft;
    if (!draft?.draftGoalSummary?.trim()) return null;
    return {
      draftGoalSummary: draft.draftGoalSummary.slice(0, 8000),
      updatedAt: draft.updatedAt,
      sourceMessageId: draft.sourceMessageId,
    };
  }

  async setDraft(
    scope: SessionScope,
    draft: { draftGoalSummary: string; sourceMessageId?: string },
  ): Promise<void> {
    const companyId = String(scope.companyId ?? '').trim();
    const roomId = String(scope.roomId ?? '').trim();
    const summary = String(draft.draftGoalSummary ?? '').trim().slice(0, 8000);
    if (!companyId || !roomId || !summary) return;
    const draftPayload: MainRoomStrategyDraftPayload = {
      draftGoalSummary: summary,
      updatedAt: new Date().toISOString(),
      sourceMessageId: draft.sourceMessageId,
    };
    if (this.isUnifiedEnabled()) {
      const updated = await this.atomicMerge(
        scope,
        { draft: JSON.stringify(draftPayload) },
        true,
      );
      if (updated) await this.dualWriteLegacy(scope, updated);
      return;
    }
    // legacy-only 模式：走原路径（无竞态风险，因为 unified 未启用时只有一个 key）
    const cur = (await this.loadState(scope)) ?? {
      schemaVersion: 1 as const,
      updatedAt: new Date().toISOString(),
    };
    await this.saveState(scope, {
      ...cur,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      draft: draftPayload,
    });
  }

  async clearDraft(scope: SessionScope): Promise<void> {
    if (this.isUnifiedEnabled()) {
      const updated = await this.atomicMerge(scope, { draft: null }, false);
      if (updated) await this.dualWriteLegacy(scope, updated);
      return;
    }
    const cur = await this.loadState(scope);
    if (!cur) return;
    const next = { ...cur, draft: undefined, updatedAt: new Date().toISOString() };
    await this.saveState(scope, next);
  }

  async getAlignment(scope: SessionScope): Promise<MainRoomCeoAlignmentSessionPayload | null> {
    const state = await this.loadState(scope);
    const a = state?.alignment;
    if (!a) return null;
    if (a.phase !== 'awaiting_execution_confirm' && a.phase !== 'authorized') return null;
    const summary = String(a.draftGoalSummary ?? '').trim();
    const kind = String(a.proposedHeavyPipelineKind ?? '').trim();
    if (!summary || !kind) return null;
    return {
      phase: a.phase,
      draftGoalSummary: summary.slice(0, 8000),
      proposedHeavyPipelineKind: kind as MainRoomCeoAlignmentSessionPayload['proposedHeavyPipelineKind'],
      proposedAt: a.proposedAt,
      sourceMessageId: a.sourceMessageId,
      authorizationMessageId: a.authorizationMessageId,
      authorizedAt: a.authorizedAt,
    };
  }

  async setAlignment(scope: SessionScope, alignment: MainRoomCeoAlignmentSessionPayload): Promise<void> {
    const alignmentSection = {
      phase: alignment.phase,
      draftGoalSummary: alignment.draftGoalSummary,
      proposedHeavyPipelineKind: alignment.proposedHeavyPipelineKind,
      proposedAt: alignment.proposedAt,
      sourceMessageId: alignment.sourceMessageId,
      authorizationMessageId: alignment.authorizationMessageId,
      authorizedAt: alignment.authorizedAt,
    };
    if (this.isUnifiedEnabled()) {
      const updated = await this.atomicMerge(
        scope,
        { alignment: JSON.stringify(alignmentSection) },
        true,
      );
      if (updated) await this.dualWriteLegacy(scope, updated);
      return;
    }
    const cur = (await this.loadState(scope)) ?? {
      schemaVersion: 1 as const,
      updatedAt: new Date().toISOString(),
    };
    await this.saveState(scope, {
      ...cur,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      alignment: alignmentSection,
    });
  }

  async clearAlignment(scope: SessionScope): Promise<void> {
    if (this.isUnifiedEnabled()) {
      const updated = await this.atomicMerge(scope, { alignment: null }, false);
      if (updated) await this.dualWriteLegacy(scope, updated);
      return;
    }
    const cur = await this.loadState(scope);
    if (!cur) return;
    await this.saveState(scope, { ...cur, alignment: undefined, updatedAt: new Date().toISOString() });
  }

}
