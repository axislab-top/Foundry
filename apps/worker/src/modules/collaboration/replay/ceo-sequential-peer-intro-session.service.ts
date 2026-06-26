import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../common/config/config.service.js';
import { RedisCacheService } from '../../../common/cache/redis-cache.service.js';
import { RoomContextService } from '../context/room-context.service.js';
import {
  AgentsActiveDirectoryCacheService,
  type AgentDirectorySlice,
} from '../context/agents-active-directory-cache.service.js';
import { buildMainRoomDirectorAgentWhitelist } from '../intent/main-room-director-whitelist.util.js';
import {
  resolveOrderedMainRoomDirectors,
  type OrderedMainRoomDirector,
} from '../intent/main-room-sequential-peer-intro.util.js';

const PROGRESS_TTL_MS = 45 * 60 * 1000;
const CHAIN_CONTINUE_DEDUPE_TTL_MS = 5 * 60 * 1000;

type SequentialIntroSessionMeta = {
  active: boolean;
  lastSummonedAgentId?: string;
};

/**
 * 「依次自我介绍」会话进度（Redis），不含任何代 CEO 调 tool 的逻辑。
 */
@Injectable()
export class CeoSequentialPeerIntroSessionService {
  constructor(
    private readonly config: ConfigService,
    private readonly redisCache: RedisCacheService,
    private readonly roomContextService: RoomContextService,
    private readonly agentsDirectory: AgentsActiveDirectoryCacheService,
  ) {}

  async activateSession(companyId: string, roomId: string): Promise<void> {
    const meta: SequentialIntroSessionMeta = { active: true };
    await this.redisCache
      .setPx(this.sessionMetaKey(companyId, roomId), JSON.stringify(meta), PROGRESS_TTL_MS)
      .catch(() => undefined);
  }

  async isSessionActive(companyId: string, roomId: string): Promise<boolean> {
    const meta = await this.loadSessionMeta(companyId, roomId);
    return meta?.active === true;
  }

  async deactivateSession(companyId: string, roomId: string): Promise<void> {
    await this.redisCache
      .setPx(this.sessionMetaKey(companyId, roomId), JSON.stringify({ active: false }), PROGRESS_TTL_MS)
      .catch(() => undefined);
  }

  /** 结束依次介绍：停用会话并清空已唤醒进度，便于后续重新启动。 */
  async endSession(companyId: string, roomId: string): Promise<void> {
    await this.deactivateSession(companyId, roomId);
    await this.redisCache.del(this.progressKey(companyId, roomId)).catch(() => undefined);
  }

  /** CEO 经 LLM 调 tool.message_send_to_agent 成功后记录。 */
  async recordDirectorSummoned(companyId: string, roomId: string, agentId: string): Promise<void> {
    const id = String(agentId ?? '').trim();
    if (!id) return;
    await this.markSummoned(companyId, roomId, id);
    const meta = (await this.loadSessionMeta(companyId, roomId)) ?? { active: false };
    meta.active = true;
    meta.lastSummonedAgentId = id;
    await this.redisCache
      .setPx(this.sessionMetaKey(companyId, roomId), JSON.stringify(meta), PROGRESS_TTL_MS)
      .catch(() => undefined);
  }

  async shouldContinueAfterDirectorReply(
    companyId: string,
    roomId: string,
    completedDirectorAgentId: string,
  ): Promise<boolean> {
    const meta = await this.loadSessionMeta(companyId, roomId);
    if (!meta?.active) return false;
    const completedId = String(completedDirectorAgentId ?? '').trim();
    return Boolean(completedId && meta.lastSummonedAgentId === completedId);
  }

  async acquireChainContinueSlot(
    companyId: string,
    roomId: string,
    completedDirectorAgentId: string,
  ): Promise<boolean> {
    const dedupeKey = `${this.config.getRedisKeyPrefix()}sequential_intro:chain:${companyId}:${roomId}:${completedDirectorAgentId}`;
    return this.redisCache.setNxPx(dedupeKey, '1', CHAIN_CONTINUE_DEDUPE_TTL_MS);
  }

  async resolveOrderedDirectors(
    companyId: string,
    roomId: string,
  ): Promise<OrderedMainRoomDirector[]> {
    const roomContext = await this.roomContextService.buildRoomContext({ companyId, roomId });
    let roster: AgentDirectorySlice[] = [];
    try {
      roster = await this.agentsDirectory.getActiveAgents(companyId, this.workerActor());
    } catch {
      roster = [];
    }
    const directorWhitelist = buildMainRoomDirectorAgentWhitelist(roomContext, roster);
    return resolveOrderedMainRoomDirectors({
      departments: roomContext.orgSnapshot?.departments ?? [],
      directorAgentIds: directorWhitelist,
      roster,
    });
  }

  async pickNextDirector(
    companyId: string,
    roomId: string,
  ): Promise<OrderedMainRoomDirector | null> {
    const ordered = await this.resolveOrderedDirectors(companyId, roomId);
    const alreadySummoned = await this.loadSummonedSet(companyId, roomId);
    for (const d of ordered) {
      if (!alreadySummoned.has(d.agentId)) return d;
    }
    return null;
  }

  async findDirectorById(
    companyId: string,
    roomId: string,
    agentId: string,
  ): Promise<OrderedMainRoomDirector | null> {
    const id = String(agentId ?? '').trim();
    if (!id) return null;
    const ordered = await this.resolveOrderedDirectors(companyId, roomId);
    return ordered.find((d) => d.agentId === id) ?? null;
  }

  private sessionMetaKey(companyId: string, roomId: string): string {
    return `${this.config.getRedisKeyPrefix()}sequential_intro:meta:${companyId}:${roomId}`;
  }

  private progressKey(companyId: string, roomId: string): string {
    return `${this.config.getRedisKeyPrefix()}sequential_intro:${companyId}:${roomId}`;
  }

  private async loadSessionMeta(
    companyId: string,
    roomId: string,
  ): Promise<SequentialIntroSessionMeta | null> {
    const raw = await this.redisCache.get(this.sessionMetaKey(companyId, roomId)).catch(() => null);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SequentialIntroSessionMeta;
    } catch {
      return null;
    }
  }

  private async loadSummonedSet(companyId: string, roomId: string): Promise<Set<string>> {
    const raw = await this.redisCache.get(this.progressKey(companyId, roomId)).catch(() => null);
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map((x) => String(x ?? '').trim()).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  private async markSummoned(companyId: string, roomId: string, agentId: string): Promise<void> {
    const current = await this.loadSummonedSet(companyId, roomId);
    current.add(agentId);
    await this.redisCache
      .setPx(this.progressKey(companyId, roomId), JSON.stringify([...current]), PROGRESS_TTL_MS)
      .catch(() => undefined);
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }
}
