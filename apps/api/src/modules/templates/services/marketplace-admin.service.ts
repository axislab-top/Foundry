import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../../llm-keys/entities/llm-key-daily-usage.entity.js';
import { MarketplaceAgentKeyBinding } from '../entities/marketplace-agent-key-binding.entity.js';
import { MarketplaceAgent } from '../entities/marketplace-agent.entity.js';

type MarketplaceAdminStatusFilter = 'all' | 'published' | 'draft';

function toUsageDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const PRICING_MODELS = new Set(['free', 'one_time', 'subscription']);

@Injectable()
export class MarketplaceAdminService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MarketplaceAgent)
    private readonly agentsRepo: Repository<MarketplaceAgent>,
    @InjectRepository(MarketplaceAgentKeyBinding)
    private readonly bindingsRepo: Repository<MarketplaceAgentKeyBinding>,
    @InjectRepository(LlmKey)
    private readonly llmKeysRepo: Repository<LlmKey>,
    @InjectRepository(LlmKeyDailyUsage)
    private readonly dailyUsageRepo: Repository<LlmKeyDailyUsage>,
  ) {}

  private async ensureModelHasActiveKey(modelName: string): Promise<void> {
    const count = await this.llmKeysRepo.count({
      where: { modelName, isActive: true } as any,
    });
    if (count <= 0) {
      throw new BadRequestException(`模型 ${modelName} 没有可用的 active LLM key`);
    }
  }

  async create(input: {
    name: string;
    slug?: string;
    description?: string | null;
    expertise?: string | null;
    systemPrompt?: string | null;
    boundModelName?: string | null;
    recommendedSkills?: string[] | null;
    skillTags?: string[] | null;
    pricingModel?: string;
    priceCents?: number;
    isPublished?: boolean;
  }): Promise<{ id: string; slug: string }> {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('name 不能为空');
    }

    if (input.pricingModel && !PRICING_MODELS.has(input.pricingModel)) {
      throw new BadRequestException('pricingModel 非法');
    }
    if (input.priceCents !== undefined && (!Number.isFinite(input.priceCents) || input.priceCents < 0)) {
      throw new BadRequestException('priceCents 不能小于 0');
    }
    if (input.isPublished && input.boundModelName?.trim()) {
      await this.ensureModelHasActiveKey(input.boundModelName.trim());
    }

    const baseSlugRaw = input.slug?.trim() || slugifyName(name);
    const baseSlug = baseSlugRaw || `agent-${Date.now()}`;

    let slug = baseSlug;
    let suffix = 1;
    while (await this.agentsRepo.exists({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const entity = this.agentsRepo.create({
      name,
      slug,
      description: input.description ?? null,
      expertise: input.expertise ?? null,
      systemPrompt: input.systemPrompt ?? null,
      boundModelName: input.boundModelName ?? null,
      recommendedSkills: input.recommendedSkills ?? [],
      skillTags: Array.isArray(input.skillTags) ? input.skillTags.map((t) => t.trim()).filter(Boolean) : [],
      pricingModel: (input.pricingModel as any) || 'free',
      priceCents: Number.isFinite(input.priceCents) ? Number(input.priceCents) : 0,
      isPublished: !!input.isPublished,
    });
    const saved = await this.agentsRepo.save(entity);
    return { id: saved.id, slug: saved.slug };
  }

  async list(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: MarketplaceAdminStatusFilter;
  }): Promise<{
    items: Array<{
      id: string;
      name: string;
      slug: string;
      boundModelName: string | null;
      keyCount: number;
      priceCents: number;
      pricingModel: string;
      isPublished: boolean;
      updatedAt: Date;
    }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const pageRaw = Number(params.page);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const sizeRaw = Number(params.pageSize);
    const pageSize =
      Number.isFinite(sizeRaw) && sizeRaw >= 1 ? Math.min(100, Math.floor(sizeRaw)) : 20;
    const status = params.status ?? 'all';

    const qb = this.agentsRepo
      .createQueryBuilder('a')
      .leftJoin(MarketplaceAgentKeyBinding, 'b', 'b.marketplace_agent_id = a.id');

    if (status === 'published') qb.andWhere('a.is_published = true');
    if (status === 'draft') qb.andWhere('a.is_published = false');

    if (params.search?.trim()) {
      qb.andWhere(
        '(a.name ILIKE :s OR a.description ILIKE :s OR a.expertise ILIKE :s OR a.slug ILIKE :s)',
        { s: `%${params.search.trim()}%` },
      );
    }

    const total = await qb.clone().select('COUNT(DISTINCT a.id)', 'cnt').getRawOne<{ cnt: string }>();
    const totalNum = Number(total?.cnt ?? 0);

    // 注意：存在 JOIN 时 TypeORM 的 getRawMany() 不会把 skip/take 写进 SQL（仅无 JOIN 时才映射为 LIMIT/OFFSET）。
    // 使用 offset/limit 才能对聚合后的结果正确分页。
    const rows = await qb
      .select([
        'a.id AS id',
        'a.name AS name',
        'a.slug AS slug',
        'a.bound_model_name AS "boundModelName"',
        'a.price_cents AS "priceCents"',
        'a.pricing_model AS "pricingModel"',
        'a.is_published AS "isPublished"',
        'a.updated_at AS "updatedAt"',
        'COUNT(b.id)::int AS "keyCount"',
      ])
      .groupBy('a.id')
      .orderBy('a.updated_at', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getRawMany<{
        id: string;
        name: string;
        slug: string;
        boundModelName: string | null;
        keyCount: number;
        priceCents: number;
        pricingModel: string;
        isPublished: boolean;
        updatedAt: Date;
      }>();

    return {
      items: rows,
      total: totalNum,
      page,
      pageSize,
      totalPages: Math.ceil(totalNum / pageSize) || 0,
    };
  }

  async findOne(id: string): Promise<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    expertise: string | null;
    systemPrompt: string | null;
    boundModelName: string | null;
    recommendedSkills: string[];
    skillTags: string[];
    pricingModel: string;
    priceCents: number;
    isPublished: boolean;
    keyBindings: Array<{
      id: string;
      llmKeyId: string;
      sortOrder: number;
      keyAlias?: string;
      isActive?: boolean;
      usedTodayTokens?: string;
      remainingTokens?: string;
      modelName?: string;
      provider?: string;
    }>;
  }> {
    const agent = await this.agentsRepo.findOne({ where: { id } });
    if (!agent) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '商品不存在',
      });
    }

    const bindings = await this.bindingsRepo.find({
      where: { marketplaceAgentId: id },
      order: { sortOrder: 'ASC' },
    });

    const keyIds = bindings.map((b) => b.llmKeyId);
    const keys = keyIds.length ? await this.llmKeysRepo.find({ where: { id: In(keyIds) } as any }) : [];
    const keyMap = new Map(keys.map((k) => [k.id, k] as const));

    const usageDate = toUsageDateUTC(new Date());
    const usageRows = keyIds.length
      ? await this.dailyUsageRepo.find({
          where: { llmKeyId: In(keyIds), usageDate } as any,
        })
      : [];
    const usageMap = new Map(usageRows.map((u) => [u.llmKeyId, u] as const));

    return {
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      expertise: agent.expertise,
      systemPrompt: agent.systemPrompt,
      boundModelName: agent.boundModelName,
      recommendedSkills: Array.isArray(agent.recommendedSkills) ? (agent.recommendedSkills as string[]) : [],
      skillTags: Array.isArray(agent.skillTags) ? agent.skillTags : [],
      pricingModel: agent.pricingModel,
      priceCents: agent.priceCents,
      isPublished: agent.isPublished,
      keyBindings: bindings.map((b) => {
        const k = keyMap.get(b.llmKeyId);
        const u = usageMap.get(b.llmKeyId);
        const used = u ? Number(u.usedTokens) : 0;
        const quota = k ? Number(k.dailyQuotaTokens) : 0;
        return {
          id: b.id,
          llmKeyId: b.llmKeyId,
          sortOrder: b.sortOrder,
          keyAlias: k?.keyAlias,
          isActive: k?.isActive,
          modelName: k?.modelName,
          provider: k?.provider,
          usedTodayTokens: k ? used.toString() : undefined,
          remainingTokens: k ? Math.max(0, quota - used).toString() : undefined,
        };
      }),
    };
  }

  async update(id: string, patch: {
    name?: string;
    description?: string | null;
    expertise?: string | null;
    systemPrompt?: string | null;
    boundModelName?: string | null;
    recommendedSkills?: string[] | null;
    skillTags?: string[] | null;
    pricingModel?: string;
    priceCents?: number;
    isPublished?: boolean;
    keyBindings?: Array<{ llmKeyId: string; sortOrder: number }>;
  }): Promise<{ ok: true }> {
    await this.dataSource.transaction(async (manager) => {
      const agents = manager.getRepository(MarketplaceAgent);
      const bindings = manager.getRepository(MarketplaceAgentKeyBinding);
      const llmKeys = manager.getRepository(LlmKey);

      const agent = await agents.findOne({ where: { id } });
      if (!agent) {
        throw new NotFoundException({
          code: ErrorCode.RECORD_NOT_FOUND,
          message: '商品不存在',
        });
      }

      if (patch.name !== undefined) agent.name = patch.name;
      if (patch.description !== undefined) agent.description = patch.description;
      if (patch.expertise !== undefined) agent.expertise = patch.expertise;
      if (patch.systemPrompt !== undefined) agent.systemPrompt = patch.systemPrompt;
      if (patch.boundModelName !== undefined) agent.boundModelName = patch.boundModelName;
      if (patch.recommendedSkills !== undefined) {
        agent.recommendedSkills = patch.recommendedSkills ?? null;
      }
      if (patch.skillTags !== undefined) {
        agent.skillTags = Array.isArray(patch.skillTags)
          ? patch.skillTags.map((t) => t.trim()).filter(Boolean)
          : [];
      }
      if (patch.pricingModel !== undefined) {
        if (!PRICING_MODELS.has(patch.pricingModel)) {
          throw new BadRequestException('pricingModel 非法');
        }
        agent.pricingModel = patch.pricingModel as any;
      }
      if (patch.priceCents !== undefined) {
        if (!Number.isFinite(patch.priceCents) || patch.priceCents < 0) {
          throw new BadRequestException('priceCents 不能小于 0');
        }
        agent.priceCents = patch.priceCents;
      }
      if (patch.isPublished !== undefined) agent.isPublished = patch.isPublished;

      const nextModelName = (patch.boundModelName ?? agent.boundModelName)?.trim();
      const nextIsPublished = patch.isPublished ?? agent.isPublished;
      if (nextIsPublished && nextModelName) {
        await this.ensureModelHasActiveKey(nextModelName);
      }

      await agents.save(agent);

      if (patch.keyBindings) {
        const seen = new Set<string>();
        for (const kb of patch.keyBindings) {
          if (seen.has(kb.llmKeyId)) {
            throw new BadRequestException('KeyBindings 中存在重复的 llmKeyId');
          }
          seen.add(kb.llmKeyId);
        }

        const ids = patch.keyBindings.map((x) => x.llmKeyId);
        const keys = ids.length ? await llmKeys.find({ where: { id: In(ids) } as any }) : [];
        if (keys.length !== ids.length) {
          throw new BadRequestException('KeyBindings 中包含不存在的 llmKeyId');
        }
        if (agent.boundModelName?.trim()) {
          const mismatch = keys.find((k) => k.modelName !== agent.boundModelName);
          if (mismatch) {
            throw new BadRequestException('绑定的 Key 必须与商品选择的模型一致');
          }
        }

        await bindings.delete({ marketplaceAgentId: id } as any);
        const rows = patch.keyBindings
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((kb) =>
            bindings.create({
              marketplaceAgentId: id,
              llmKeyId: kb.llmKeyId,
              sortOrder: kb.sortOrder,
            }),
          );
        try {
          if (rows.length) await bindings.save(rows);
        } catch (e: any) {
          if (String(e?.code ?? '') === '23505') {
            throw new BadRequestException('存在已被其他商品绑定的 Key（跨商品不允许复用）');
          }
          throw e;
        }
      }
    });

    return { ok: true };
  }
}

