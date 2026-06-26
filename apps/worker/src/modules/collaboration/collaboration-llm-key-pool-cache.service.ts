import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';

type PoolRow = { at: number; llmKeyIds: string[]; source?: string; exclusiveReplayKeyPool?: boolean };

/**
 * 进程内缓存 `agents.llmKeyPoolCandidates` 结果，降低冷路径 RPC 与 `localCandidatePoolSize: 0` 频率。
 */
@Injectable()
export class CollaborationLlmKeyPoolCacheService {
  private readonly cache = new Map<string, PoolRow>();

  constructor(private readonly config: ConfigService) {}

  private cacheKey(companyId: string, agentId: string, ceoContext: string): string {
    return `${String(companyId).trim()}|${String(agentId).trim()}|${String(ceoContext ?? '').trim() || 'default'}`;
  }

  get(companyId: string, agentId: string, ceoContext: string): PoolRow | null {
    const ttl = this.config.getCollabLlmKeyPoolCacheTtlMs();
    const row = this.cache.get(this.cacheKey(companyId, agentId, ceoContext));
    if (!row) return null;
    if (Date.now() - row.at > ttl) {
      this.cache.delete(this.cacheKey(companyId, agentId, ceoContext));
      return null;
    }
    return row;
  }

  set(
    companyId: string,
    agentId: string,
    ceoContext: string,
    data: { llmKeyIds: string[]; source?: string; exclusiveReplayKeyPool?: boolean },
  ): void {
    this.cache.set(this.cacheKey(companyId, agentId, ceoContext), {
      at: Date.now(),
      llmKeyIds: [...data.llmKeyIds],
      source: data.source,
      exclusiveReplayKeyPool: data.exclusiveReplayKeyPool,
    });
  }

  /** 商城模板绑定变更后清理该 Agent 各 ceoContext 下的候选池缓存 */
  invalidateAgent(companyId: string, agentId: string): void {
    const prefix = `${String(companyId).trim()}|${String(agentId).trim()}|`;
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}
