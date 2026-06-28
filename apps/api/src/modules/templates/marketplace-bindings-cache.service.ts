import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../../common/cache/cache.service.js';
import { MarketplaceAgentKeyBinding } from './entities/marketplace-agent-key-binding.entity.js';

/** 与 DB 行一致的可序列化字段（用于 Redis / 内存缓存） */
export type MarketplaceBindingCacheRow = Pick<
  MarketplaceAgentKeyBinding,
  | 'id'
  | 'marketplaceAgentId'
  | 'llmKeyId'
  | 'sortOrder'
  | 'ceoLayer'
  | 'embeddingModelId'
  | 'embeddingIsPrimary'
>;

const KEY_PREFIX = 'foundry:v1:mp:bindings:v2:';
const TTL_SECONDS = 60;

@Injectable()
export class MarketplaceBindingsCacheService {
  constructor(
    private readonly cache: CacheService,
    @InjectRepository(MarketplaceAgentKeyBinding)
    private readonly bindingsRepo: Repository<MarketplaceAgentKeyBinding>,
  ) {}

  private cacheKey(marketplaceAgentId: string): string {
    return `${KEY_PREFIX}${marketplaceAgentId}`;
  }

  /**
   * 读取商城 Agent 的 key bindings（短 TTL 缓存，变更时由 Admin 主动 invalidate）。
   */
  async findBindingsOrdered(marketplaceAgentId: string): Promise<MarketplaceBindingCacheRow[]> {
    const id = marketplaceAgentId?.trim();
    if (!id) return [];

    const raw = await this.cache.get<string>(this.cacheKey(id));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as MarketplaceBindingCacheRow[];
        if (Array.isArray(parsed)) return parsed;
      } catch {
        /* miss */
      }
    }

    const rows = await this.bindingsRepo.find({
      where: { marketplaceAgentId: id },
      order: { sortOrder: 'ASC' },
    });

    const plain: MarketplaceBindingCacheRow[] = rows.map((r) => ({
      id: r.id,
      marketplaceAgentId: r.marketplaceAgentId,
      llmKeyId: r.llmKeyId,
      sortOrder: r.sortOrder,
      ceoLayer: r.ceoLayer,
      embeddingModelId: r.embeddingModelId,
      embeddingIsPrimary: r.embeddingIsPrimary,
    }));

    await this.cache.set(this.cacheKey(id), JSON.stringify(plain), TTL_SECONDS);
    return plain;
  }

  async invalidate(marketplaceAgentId: string): Promise<void> {
    const id = marketplaceAgentId?.trim();
    if (!id) return;
    await this.cache.delete(this.cacheKey(id));
  }
}
