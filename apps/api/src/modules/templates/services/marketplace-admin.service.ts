import { BadRequestException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { TenantContextService } from '@service/tenant';
import { InjectRepository } from '@nestjs/typeorm';
import type { MarketplaceBindingUpdatedEvent } from '@contracts/events';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { ConfigService } from '../../../common/config/config.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { LlmKeysService } from '../../llm-keys/llm-keys.service.js';
import { LlmKeyDailyUsage } from '../../llm-keys/entities/llm-key-daily-usage.entity.js';
import { LlmModel } from '../../llm-models/entities/llm-model.entity.js';
import { MarketplaceAgentKeyBinding } from '../entities/marketplace-agent-key-binding.entity.js';
import { MarketplaceAgent, type MarketplaceAgentCategory } from '../entities/marketplace-agent.entity.js';
import { MarketplaceAgentSubscription } from '../entities/marketplace-agent-subscription.entity.js';
import { MarketplaceHireRequest } from '../entities/marketplace-hire-request.entity.js';
import { PlatformDepartment } from '../entities/platform-department.entity.js';
import { Skill } from '../../skills/entities/skill.entity.js';
import {
  isSkillBindingGatePending,
  SkillBindingValidatorService,
} from '../../skills/services/skill-binding-validator.service.js';
import { RecommendedSkillsValidator } from '../validators/recommended-skills.validator.js';
import { MarketplaceBindingsCacheService } from '../marketplace-bindings-cache.service.js';
import { MarketplaceSkillVersionService } from './marketplace-skill-version.service.js';
import { CeoLayerConfigService } from '../../companies/services/ceo-layer-config.service.js';
import { AgentsService } from '../../agents/services/agents.service.js';
import { normalizeCeoLayerConfig } from '@foundry/skills';
import {
  MarketplaceCatalogPricingService,
  type MarketplaceCatalogPricingView,
} from './marketplace-catalog-pricing.service.js';

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

/** 校验 boundModelName 存在于平台 chat 模型库（与 Admin 模型库下拉一致）。 */
/** 商城模板保存后需下发到已安装公司 Agent 的 patch 字段（排除纯运营/校验字段）。 */
function marketplaceAdminPatchAffectsInstalledAgents(patch: Record<string, unknown>): boolean {
  const operationalOnly = new Set([
    'isPublished',
    'skillBindingValidationCompanyId',
    'operatorUserId',
  ]);
  return Object.entries(patch).some(
    ([key, value]) => !operationalOnly.has(key) && value !== undefined,
  );
}

function marketplaceAdminPatchChangedFieldNames(patch: Record<string, unknown>): string[] {
  const operationalOnly = new Set([
    'isPublished',
    'skillBindingValidationCompanyId',
    'operatorUserId',
  ]);
  return Object.keys(patch).filter((key) => !operationalOnly.has(key) && patch[key] !== undefined);
}

async function resolveBoundModelNameForWrite(
  llmModelsRepo: Repository<LlmModel>,
  raw: string | null | undefined,
): Promise<string | null> {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return null;
  const row = await llmModelsRepo.findOne({
    where: { modelName: trimmed, modelType: 'chat' as const, isActive: true },
  });
  if (!row) {
    throw new BadRequestException(`模型「${trimmed}」不存在于平台 chat 模型库或未启用`);
  }
  return trimmed;
}

/** 上架 CEO 模板时**必须**每层至少一钥（与 Worker 执行栈 L1–L3 对应）。 */
const CEO_POOL_LAYERS = ['strategy', 'orchestration', 'supervision'] as const;
type CeoPoolLayer = (typeof CEO_POOL_LAYERS)[number];

/** 可选：商城可为 Intent / Replay 单独绑池，供 RPC `resolveLlmKeyPoolCandidates(ceoContext)` 按层取用；未绑则各公司依赖 contextPolicy / 平台下发。 */
const CEO_OPTIONAL_POOL_LAYERS = ['intent', 'replay'] as const;

function sortMarketplaceBindings<T extends { ceoLayer?: string; sortOrder: number }>(rows: T[]): T[] {
  const rank = (l: string) => {
    if (l === 'default') return 0;
    if (l === 'intent') return 1;
    if (l === 'replay') return 2;
    if (l === 'strategy') return 3;
    if (l === 'orchestration') return 4;
    if (l === 'supervision') return 5;
    return 9;
  };
  return [...rows].sort(
    (a, b) => rank(a.ceoLayer ?? 'default') - rank(b.ceoLayer ?? 'default') || a.sortOrder - b.sortOrder,
  );
}

@Injectable()
export class MarketplaceAdminService {
  private readonly logger = new Logger(MarketplaceAdminService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MarketplaceAgent)
    private readonly agentsRepo: Repository<MarketplaceAgent>,
    @InjectRepository(PlatformDepartment)
    private readonly platformDeptRepo: Repository<PlatformDepartment>,
    @InjectRepository(MarketplaceAgentKeyBinding)
    private readonly bindingsRepo: Repository<MarketplaceAgentKeyBinding>,
    @InjectRepository(LlmKey)
    private readonly llmKeysRepo: Repository<LlmKey>,
    @InjectRepository(LlmKeyDailyUsage)
    private readonly dailyUsageRepo: Repository<LlmKeyDailyUsage>,
    @InjectRepository(Skill)
    private readonly skillsRepo: Repository<Skill>,
    @InjectRepository(LlmModel)
    private readonly llmModelsRepo: Repository<LlmModel>,
    @InjectRepository(MarketplaceAgentSubscription)
    private readonly subscriptionsRepo: Repository<MarketplaceAgentSubscription>,
    @InjectRepository(MarketplaceHireRequest)
    private readonly hireRequestsRepo: Repository<MarketplaceHireRequest>,
    private readonly recommendedSkillsValidator: RecommendedSkillsValidator,
    private readonly messagingService: MessagingService,
    private readonly bindingsCache: MarketplaceBindingsCacheService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly skillBindingValidator: SkillBindingValidatorService,
    private readonly marketplaceSkillVersion: MarketplaceSkillVersionService,
    private readonly ceoLayerConfigService: CeoLayerConfigService,
    @Inject(forwardRef(() => AgentsService))
    private readonly agentsService: AgentsService,
    private readonly llmKeysService: LlmKeysService,
    private readonly catalogPricingService: MarketplaceCatalogPricingService,
  ) {}

  /**
   * 管理端试调用：用模板 systemPrompt + 绑定 Key/模型发起一次 Chat，无需安装到公司组织树。
   */
  async testInvoke(
    marketplaceAgentId: string,
    input: { message: string; llmKeyId?: string; maxTokens?: number },
  ): Promise<{
    ok: true;
    reply: string;
    modelName: string;
    boundModelName: string | null;
    llmKeyId: string;
    keyAlias: string;
    provider: string;
    durationMs: number;
    upstreamDurationMs: number;
    recommendedSkills: string[];
    systemPromptUsed: boolean;
    agentName: string;
    debug: {
      requestEndpoint: string;
      requestBody: Record<string, unknown>;
      responseBody: unknown;
      httpStatus: number;
      systemPrompt: string;
      userMessage: string;
    };
  }> {
    const started = Date.now();
    const detail = await this.findOne(marketplaceAgentId);
    const message = input.message?.trim();
    if (!message) {
      throw new BadRequestException('测试消息不能为空');
    }

    const boundModel = detail.boundModelName?.trim();
    if (!boundModel) {
      throw new BadRequestException('请先为模板配置绑定模型（boundModelName）');
    }

    const bindings = (detail.keyBindings ?? []).filter((b) => b.isActive !== false);
    if (!bindings.length) {
      throw new BadRequestException('请先为模板绑定至少一个可用 LLM Key');
    }

    const defaultLayerBindings = bindings.filter(
      (b) => !b.ceoLayer || b.ceoLayer === 'default',
    );
    const pool = defaultLayerBindings.length ? defaultLayerBindings : bindings;

    let pickedKeyId = input.llmKeyId?.trim();
    if (pickedKeyId) {
      const bound = pool.some((b) => b.llmKeyId === pickedKeyId);
      if (!bound) {
        throw new BadRequestException('所选 Key 未绑定到此商城模板');
      }
    } else {
      const candidate =
        pool.find((b) => !b.modelName || b.modelName === boundModel) ?? pool[0];
      pickedKeyId = candidate?.llmKeyId;
    }
    if (!pickedKeyId) {
      throw new BadRequestException('没有可用的 Key（请检查模型匹配与启用状态）');
    }

    const expertise = detail.expertise?.trim();
    const systemPrompt =
      detail.systemPrompt?.trim() ||
      `你是「${detail.name}」${expertise ? `，专长：${expertise}` : ''}。请按角色要求回答用户。`;

    const invoke = await this.llmKeysService.invokeChatWithKeyId({
      llmKeyId: pickedKeyId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      maxTokens: input.maxTokens ?? 2048,
    });

    return {
      ok: true,
      reply: invoke.content,
      modelName: invoke.modelName,
      boundModelName: boundModel,
      llmKeyId: pickedKeyId,
      keyAlias: invoke.keyAlias,
      provider: invoke.provider,
      durationMs: Date.now() - started,
      upstreamDurationMs: invoke.upstreamDurationMs,
      recommendedSkills: detail.recommendedSkills ?? [],
      systemPromptUsed: !!detail.systemPrompt?.trim(),
      agentName: detail.name,
      debug: {
        requestEndpoint: invoke.requestEndpoint,
        requestBody: invoke.requestBody,
        responseBody: invoke.rawResponse,
        httpStatus: invoke.httpStatus,
        systemPrompt,
        userMessage: message,
      },
    };
  }

  async create(input: {
    name: string;
    slug?: string;
    iconUrl?: string | null;
    description?: string | null;
    expertise?: string | null;
    systemPrompt?: string | null;
    boundModelName?: string | null;
    recommendedSkills?: string[] | null;
    skillTags?: string[] | null;
    agentCategory: MarketplaceAgentCategory;
    departmentRoles?: string[] | null;
    industryTags?: string[] | null;
    version?: string | null;
    recommendedForScales?: string[] | null;
    isPublished?: boolean;
    keyBindings?: Array<{ llmKeyId: string; sortOrder: number; ceoLayer?: string }>;
  }): Promise<{ id: string; slug: string }> {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('name 不能为空');
    }

    const baseSlugRaw = input.slug?.trim() || slugifyName(name);
    const baseSlug = baseSlugRaw || `agent-${Date.now()}`;

    let slug = baseSlug;
    let suffix = 1;
    while (await this.agentsRepo.exists({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const deptRoles = Array.isArray(input.departmentRoles)
      ? input.departmentRoles.map((t) => t.trim()).filter(Boolean)
      : [];
    if (input.agentCategory === 'department_head') {
      if (!deptRoles.length) {
        throw new BadRequestException('部门主管必须配置所属部门（departmentRoles，至少一项）');
      }
    }

    const recommendedSkillsMerged = Array.isArray(input.recommendedSkills)
      ? input.recommendedSkills
      : [];
    await this.recommendedSkillsValidator.assertAllGlobalSkillsExist(
      recommendedSkillsMerged,
      'marketplace_admin_create',
    );

    const iconUrl =
      typeof input.iconUrl === 'string' && input.iconUrl.trim() ? input.iconUrl.trim().slice(0, 2048) : null;

    const keyBindings = Array.isArray(input.keyBindings)
      ? input.keyBindings
          .map((kb, index) => ({
            llmKeyId: String(kb.llmKeyId ?? '').trim(),
            sortOrder: Number.isFinite(kb.sortOrder) ? Number(kb.sortOrder) : index,
            ceoLayer: kb.ceoLayer,
          }))
          .filter((kb) => kb.llmKeyId)
      : [];

    if (input.isPublished && keyBindings.length === 0 && input.agentCategory !== 'ceo') {
      throw new BadRequestException('上架前请先配置 Key 池（至少绑定一个 Key）');
    }

    const boundModelName = await resolveBoundModelNameForWrite(this.llmModelsRepo, input.boundModelName);

    const entity = this.agentsRepo.create({
      name,
      slug,
      iconUrl,
      description: input.description ?? null,
      expertise: input.expertise ?? null,
      systemPrompt: input.systemPrompt ?? null,
      boundModelName,
      recommendedSkills: recommendedSkillsMerged,
      skillTags: Array.isArray(input.skillTags) ? input.skillTags.map((t) => t.trim()).filter(Boolean) : [],
      agentCategory: input.agentCategory,
      departmentRoles: deptRoles,
      metadata: {
        industryTags: Array.isArray(input.industryTags)
          ? input.industryTags.map((t) => t.trim()).filter(Boolean)
          : [],
        version: input.version?.trim() || 'v1',
        recommendedForScales: Array.isArray(input.recommendedForScales)
          ? input.recommendedForScales.map((t) => t.trim()).filter(Boolean)
          : ['small', 'medium', 'large'],
      },
      isPublished: !!input.isPublished,
    });
    const saved = await this.agentsRepo.save(entity);
    if (keyBindings.length > 0) {
      await this.update(saved.id, { keyBindings });
    }
    return { id: saved.id, slug: saved.slug };
  }

  async list(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: MarketplaceAdminStatusFilter;
    agentCategory?: MarketplaceAgentCategory;
  }): Promise<{
    items: Array<{
      id: string;
      name: string;
      slug: string;
      iconUrl: string | null;
      boundModelName: string | null;
      keyCount: number;
      isPublished: boolean;
      agentCategory: MarketplaceAgentCategory;
      departmentRoles: string[];
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
    if (params.agentCategory) qb.andWhere('a.agent_category = :agentCategory', { agentCategory: params.agentCategory });

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
        'a.icon_url AS "iconUrl"',
        'a.bound_model_name AS "boundModelName"',
        'a.is_published AS "isPublished"',
        'a.agent_category AS "agentCategory"',
        'a.department_roles AS "departmentRoles"',
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
        iconUrl: string | null;
        boundModelName: string | null;
        keyCount: number;
        isPublished: boolean;
        agentCategory: MarketplaceAgentCategory;
        departmentRoles: string[];
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
    iconUrl: string | null;
    description: string | null;
    expertise: string | null;
    systemPrompt: string | null;
    boundModelName: string | null;
    recommendedSkills: string[];
    skillTags: string[];
    isPublished: boolean;
    agentCategory: MarketplaceAgentCategory;
    departmentRoles: string[];
    industryTags: string[];
    version: string;
    recommendedForScales: string[];
    keyBindings: Array<{
      id: string;
      llmKeyId: string;
      sortOrder: number;
      ceoLayer: string;
      keyAlias?: string;
      isActive?: boolean;
      usedTodayTokens?: string;
      remainingTokens?: string;
      modelName?: string;
      provider?: string;
    }>;
    ceoLayerConfig: Record<string, unknown>;
    recommendedSkillVersionIds: string[];
    boundPlatformDepartment: { id: string; slug: string; displayName: string } | null;
    catalogPricing: MarketplaceCatalogPricingView | null;
  }> {
    const agent = await this.agentsRepo.findOne({ where: { id } });
    if (!agent) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '商品不存在',
      });
    }

    const bindingsRaw = await this.bindingsRepo.find({
      where: { marketplaceAgentId: id },
      order: { sortOrder: 'ASC' },
    });
    const bindings = sortMarketplaceBindings(bindingsRaw);
    const keyIds = bindings.map((b) => b.llmKeyId);
    const keys = keyIds.length ? await this.llmKeysRepo.find({ where: { id: In(keyIds) } as any }) : [];
    const keyMap = new Map(keys.map((k) => [k.id, k] as const));

    const boundDept = await this.platformDeptRepo.findOne({
      where: { director: { id } },
    });

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
      iconUrl: agent.iconUrl ?? null,
      description: agent.description,
      expertise: agent.expertise,
      systemPrompt: agent.systemPrompt,
      boundModelName: agent.boundModelName,
      recommendedSkills: Array.isArray(agent.recommendedSkills) ? (agent.recommendedSkills as string[]) : [],
      recommendedSkillVersionIds: Array.isArray(agent.recommendedSkillVersionIds)
        ? agent.recommendedSkillVersionIds.map((x) => String(x ?? '').trim()).filter(Boolean)
        : [],
      skillTags: Array.isArray(agent.skillTags) ? agent.skillTags : [],
      isPublished: agent.isPublished,
      agentCategory: agent.agentCategory,
      departmentRoles: Array.isArray(agent.departmentRoles) ? agent.departmentRoles : [],
      industryTags: Array.isArray((agent.metadata as any)?.industryTags)
        ? ((agent.metadata as any).industryTags as string[])
        : [],
      version:
        typeof (agent.metadata as any)?.version === 'string'
          ? ((agent.metadata as any).version as string)
          : 'v1',
      recommendedForScales: Array.isArray((agent.metadata as any)?.recommendedForScales)
        ? ((agent.metadata as any).recommendedForScales as string[])
        : ['small', 'medium', 'large'],
      keyBindings: bindings.map((b) => {
        const k = keyMap.get(b.llmKeyId);
        const u = usageMap.get(b.llmKeyId);
        const used = u ? Number(u.usedTokens) : 0;
        const quota = k ? Number(k.dailyQuotaTokens) : 0;
        return {
          id: b.id,
          llmKeyId: b.llmKeyId,
          sortOrder: b.sortOrder,
          ceoLayer: b.ceoLayer ?? 'default',
          embeddingModelId: b.embeddingModelId ?? null,
          embeddingIsPrimary: b.embeddingIsPrimary ?? true,
          keyAlias: k?.keyAlias,
          isActive: k?.isActive,
          modelName: k?.modelName,
          provider: k?.provider,
          usedTodayTokens: k ? used.toString() : undefined,
          remainingTokens: k ? Math.max(0, quota - used).toString() : undefined,
        };
      }),
      ceoLayerConfig:
        agent.slug === 'ceo'
          ? normalizeCeoLayerConfig(agent.ceoLayerConfig ?? {})
          : ((agent.ceoLayerConfig ?? {}) as Record<string, unknown>),
      boundPlatformDepartment: boundDept
        ? { id: boundDept.id, slug: boundDept.slug, displayName: boundDept.displayName }
        : null,
      catalogPricing: await this.catalogPricingService.resolveForAgent(agent),
    };
  }

  async update(id: string, patch: {
    name?: string;
    iconUrl?: string | null;
    description?: string | null;
    expertise?: string | null;
    systemPrompt?: string | null;
    ceoLayerConfig?: Record<string, unknown>;
    boundModelName?: string | null;
    recommendedSkills?: string[] | null;
    skillTags?: string[] | null;
    agentCategory?: MarketplaceAgentCategory;
    departmentRoles?: string[] | null;
    industryTags?: string[] | null;
    version?: string | null;
    recommendedForScales?: string[] | null;
    isPublished?: boolean;
    keyBindings?: Array<{ llmKeyId: string; sortOrder: number; ceoLayer?: string }>;
    /** 全商品统一的 Embedding 池条目；与 keyBindings 一并提交或在仅改模型时单独提交 */
    defaultEmbeddingModelId?: string | null;
    /** P13：可选，提供时则对 CEO 三层 skillIds 做公司级绑定强校验 */
    skillBindingValidationCompanyId?: string | null;
    operatorUserId?: string | null;
    recommendedSkillVersionIds?: string[] | null;
  }): Promise<{ ok: true }> {
    const shouldPropagateInstalledAgentsLlm = marketplaceAdminPatchAffectsInstalledAgents(
      patch as Record<string, unknown>,
    );
    let shouldPropagateCeoTemplate = false;

    const beforePins = await this.agentsRepo.findOne({
      where: { id },
      select: ['id', 'recommendedSkillVersionIds'],
    });
    const prevSkillPins = [...(beforePins?.recommendedSkillVersionIds ?? [])];

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

      const boundDept = await manager.getRepository(PlatformDepartment).findOne({
        where: { director: { id } },
      });
      const normalizeRoles = (input?: string[] | null): string[] =>
        Array.from(
          new Set(
            (Array.isArray(input) ? input : [])
              .map((x) => String(x ?? '').trim())
              .filter(Boolean),
          ),
        ).sort();
      if (
        boundDept &&
        (patch.agentCategory !== undefined || patch.departmentRoles !== undefined)
      ) {
        const nextCategory = patch.agentCategory ?? agent.agentCategory;
        const currentRoles = normalizeRoles(agent.departmentRoles as string[] | null | undefined);
        const nextRoles = normalizeRoles(
          patch.departmentRoles !== undefined
            ? ((patch.departmentRoles as string[] | null | undefined) ?? [])
            : (agent.departmentRoles as string[] | null | undefined),
        );
        const categoryChanged = nextCategory !== agent.agentCategory;
        const rolesChanged =
          currentRoles.length !== nextRoles.length ||
          currentRoles.some((role, index) => role !== nextRoles[index]);
        if (!categoryChanged && !rolesChanged) {
          // 仅是前端重复回传原值，不应阻断与部门无关的保存（例如模型调整）
        } else {
        throw new BadRequestException(
          '该商品已通过「平台部门」绑定为部门总监，请在「平台部门」管理中调整主管部门或更换绑定',
        );
        }
      }

      if (patch.name !== undefined) agent.name = patch.name;
      if (patch.iconUrl !== undefined) {
        agent.iconUrl =
          typeof patch.iconUrl === 'string' && patch.iconUrl.trim()
            ? patch.iconUrl.trim().slice(0, 2048)
            : null;
      }
      if (patch.description !== undefined) agent.description = patch.description;
      if (patch.expertise !== undefined) agent.expertise = patch.expertise;
      if (patch.systemPrompt !== undefined) agent.systemPrompt = patch.systemPrompt;
      if (patch.ceoLayerConfig !== undefined) {
        agent.ceoLayerConfig =
          agent.slug === 'ceo'
            ? normalizeCeoLayerConfig(patch.ceoLayerConfig)
            : (patch.ceoLayerConfig as Record<string, unknown>);
        if (agent.slug === 'ceo') {
          shouldPropagateCeoTemplate = true;
        }

        if (agent.slug === 'ceo') {
          const cfg = agent.ceoLayerConfig as Record<string, any>;
          const allSkillIds = Array.from(
            new Set(
              CEO_POOL_LAYERS.flatMap((layer) =>
                Array.isArray(cfg?.[layer]?.skillIds) ? (cfg[layer].skillIds as unknown[]) : [],
              )
                .map((x) => String(x ?? '').trim())
                .filter(Boolean),
            ),
          );
          if (allSkillIds.length) {
            const existing = await this.skillsRepo.find({
              where: { id: In(allSkillIds), companyId: IsNull() },
              select: ['id'],
            });
            const ok = new Set(existing.map((s) => s.id));
            const missing = allSkillIds.filter((id) => !ok.has(id));
            if (missing.length) {
              throw new BadRequestException(
                `CEO 三层 skillIds 存在不存在的 Skill ID（仅支持平台全局 skills）：${missing.join(', ')}`,
              );
            }
            const bindCid = patch.skillBindingValidationCompanyId?.trim();
            if (bindCid && allSkillIds.length) {
              await this.tenantContext.runWithCompanyId(bindCid, () =>
                this.skillBindingValidator.validateSkillsBelongToCompany(bindCid, allSkillIds, {
                  operatorId: patch.operatorUserId ?? null,
                  source: 'marketplace_admin_ceo_template_update',
                }),
              );
            }
          }
        }
      }
      if (patch.boundModelName !== undefined && patch.keyBindings === undefined) {
        agent.boundModelName = await resolveBoundModelNameForWrite(
          this.llmModelsRepo,
          patch.boundModelName,
        );
      }
      if (patch.recommendedSkills !== undefined) {
        const nextRecommended = patch.recommendedSkills ?? [];
        await this.recommendedSkillsValidator.assertAllGlobalSkillsExist(
          nextRecommended,
          'marketplace_admin_update',
        );
        agent.recommendedSkills = nextRecommended;
      }
      if (patch.recommendedSkillVersionIds !== undefined) {
        const list = Array.isArray(patch.recommendedSkillVersionIds)
          ? patch.recommendedSkillVersionIds.map((x) => String(x ?? '').trim()).filter(Boolean)
          : [];
        if (list.length) {
          const found = await this.skillsRepo.find({
            where: { id: In(list), companyId: IsNull() },
            select: ['id'],
          });
          if (found.length !== list.length) {
            throw new BadRequestException('recommendedSkillVersionIds 含不存在或非平台全局的 Skill 行');
          }
        }
        agent.recommendedSkillVersionIds = list.length ? list : null;
      }
      if (patch.skillTags !== undefined) {
        agent.skillTags = Array.isArray(patch.skillTags)
          ? patch.skillTags.map((t) => t.trim()).filter(Boolean)
          : [];
      }
      if (patch.agentCategory !== undefined) {
        agent.agentCategory = patch.agentCategory;
      }
      if (patch.departmentRoles !== undefined) {
        agent.departmentRoles = Array.isArray(patch.departmentRoles)
          ? patch.departmentRoles.map((t) => t.trim()).filter(Boolean)
          : [];
      }
      const prevMeta = (agent.metadata ?? {}) as Record<string, unknown>;
      const nextMeta: Record<string, unknown> = { ...prevMeta };
      if (patch.industryTags !== undefined) {
        nextMeta.industryTags = Array.isArray(patch.industryTags)
          ? patch.industryTags.map((t) => t.trim()).filter(Boolean)
          : [];
      }
      if (patch.version !== undefined) {
        nextMeta.version = patch.version?.trim() || 'v1';
      }
      if (patch.recommendedForScales !== undefined) {
        nextMeta.recommendedForScales = Array.isArray(patch.recommendedForScales)
          ? patch.recommendedForScales.map((t) => t.trim()).filter(Boolean)
          : ['small', 'medium', 'large'];
      }
      agent.metadata = nextMeta;

      if (patch.isPublished !== undefined) agent.isPublished = patch.isPublished;

      const nextIsPublished = patch.isPublished ?? agent.isPublished;
      if (nextIsPublished) {
        const names = Array.isArray(agent.recommendedSkills) ? (agent.recommendedSkills as string[]) : [];
        await this.recommendedSkillsValidator.assertAllGlobalSkillsExist(
          names,
          'marketplace_admin_publish',
        );
      }

      if (agent.agentCategory === 'department_head' && !agent.departmentRoles?.length) {
        throw new BadRequestException('部门主管必须配置所属部门（departmentRoles，至少一项）');
      }

      await agents.save(agent);

      if (patch.defaultEmbeddingModelId !== undefined && !patch.keyBindings) {
        const embRepo = manager.getRepository(LlmModel);
        const raw = patch.defaultEmbeddingModelId?.trim();
        if (!raw) {
          await bindings.update(
            { marketplaceAgentId: id } as any,
            { embeddingModelId: null, embeddingIsPrimary: true },
          );
        } else {
          const em = await embRepo.findOne({ where: { id: raw, modelType: 'embedding' as any } });
          if (!em) {
            throw new BadRequestException('defaultEmbeddingModelId 不存在');
          }
          await bindings.update(
            { marketplaceAgentId: id } as any,
            { embeddingModelId: em.id, embeddingIsPrimary: true },
          );
        }
      }

      if (patch.keyBindings) {
        const embRepo = manager.getRepository(LlmModel);
        const existingBindingsBefore = await bindings.find({ where: { marketplaceAgentId: id } });
        let embeddingModelIdToApply: string | null =
          patch.defaultEmbeddingModelId === undefined
            ? existingBindingsBefore.map((b) => b.embeddingModelId).find((x) => !!x) ?? null
            : null;
        if (patch.defaultEmbeddingModelId !== undefined) {
          const embRaw = patch.defaultEmbeddingModelId?.trim();
          if (!embRaw) {
            embeddingModelIdToApply = null;
          } else {
            const em = await embRepo.findOne({ where: { id: embRaw, modelType: 'embedding' as any } });
            if (!em) {
              throw new BadRequestException('defaultEmbeddingModelId 不存在');
            }
            embeddingModelIdToApply = em.id;
          }
        }

        const seen = new Set<string>();
        for (const kb of patch.keyBindings) {
          if (seen.has(kb.llmKeyId)) {
            throw new BadRequestException('KeyBindings 中存在重复的 llmKeyId');
          }
          seen.add(kb.llmKeyId);
        }

        const resolveLayer = (kb: { ceoLayer?: string }): string => {
          if (agent.slug === 'ceo') {
            const L = String(kb.ceoLayer ?? '').trim();
            if (
              L === 'strategy' ||
              L === 'orchestration' ||
              L === 'supervision' ||
              L === 'intent' ||
              L === 'replay'
            ) {
              return L;
            }
            throw new BadRequestException(
              'CEO 商品的 KeyBindings 必须指定 ceoLayer（strategy / orchestration / supervision；可选 intent / replay）',
            );
          }
          return 'default';
        };

        const normalized = patch.keyBindings.map((kb) => ({
          llmKeyId: kb.llmKeyId,
          sortOrder: kb.sortOrder,
          ceoLayer: resolveLayer(kb),
        }));

        const ids = normalized.map((x) => x.llmKeyId);
        const keyRows = ids.length ? await llmKeys.find({ where: { id: In(ids) } as any }) : [];
        if (keyRows.length !== ids.length) {
          throw new BadRequestException('KeyBindings 中包含不存在的 llmKeyId');
        }
        const keyById = new Map(keyRows.map((k) => [k.id, k] as const));

        if (agent.slug === 'ceo') {
          const validateCeoBindingLayer = (L: string) => {
            const layerIds = normalized.filter((x) => x.ceoLayer === L).map((x) => x.llmKeyId);
            if (layerIds.length === 0) {
              throw new BadRequestException(`CEO 每一层都必须至少绑定一个 Key（缺少 ${L}）`);
            }
            const layerKeys = layerIds.map((i) => keyById.get(i)).filter(Boolean) as typeof keyRows;
            const modelNames = Array.from(new Set(layerKeys.map((k) => k.modelName)));
            if (modelNames.length > 1) {
              throw new BadRequestException(`CEO 同一层（${L}）的 Key 池必须全部属于同一模型`);
            }
            const providers = Array.from(new Set(layerKeys.map((k) => k.provider)));
            if (providers.length > 1) {
              throw new BadRequestException(`CEO 同一层（${L}）的 Key 池必须全部来自同一提供商`);
            }
          };
          for (const L of CEO_POOL_LAYERS) {
            validateCeoBindingLayer(L);
          }
          for (const L of CEO_OPTIONAL_POOL_LAYERS) {
            if (normalized.some((x) => x.ceoLayer === L)) {
              validateCeoBindingLayer(L);
            }
          }
        } else {
          const modelNames = Array.from(new Set(keyRows.map((k) => k.modelName)));
          if (modelNames.length > 1) {
            throw new BadRequestException('同一 Agent 的 Key 池必须全部属于同一模型');
          }
          const providers = Array.from(new Set(keyRows.map((k) => k.provider)));
          if (providers.length > 1) {
            throw new BadRequestException('同一 Agent 的 Key 池必须全部来自同一提供商');
          }
          const presetBound = agent.boundModelName?.trim();
          const poolModel = modelNames[0]?.trim();
          if (presetBound && poolModel && presetBound !== poolModel) {
            throw new BadRequestException(
              `Key 池模型须与商品绑定模型「${presetBound}」一致（当前为「${poolModel}」）`,
            );
          }
        }

        await bindings.delete({ marketplaceAgentId: id } as any);
        const rows = sortMarketplaceBindings(normalized).map((kb) =>
          bindings.create({
            marketplaceAgentId: id,
            llmKeyId: kb.llmKeyId,
            sortOrder: kb.sortOrder,
            ceoLayer: kb.ceoLayer,
            embeddingModelId: embeddingModelIdToApply,
            embeddingIsPrimary: true,
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

        const savedRows = await bindings.find({ where: { marketplaceAgentId: id } });
        if (agent.slug === 'ceo') {
          const strategyFirst = savedRows.find((b) => b.ceoLayer === 'strategy');
          const k0 = strategyFirst ? keyById.get(strategyFirst.llmKeyId) : undefined;
          agent.boundModelName = k0?.modelName ?? null;
          const cfg = normalizeCeoLayerConfig(agent.ceoLayerConfig ?? {});
          for (const layer of CEO_POOL_LAYERS) {
            const layerBindings = savedRows
              .filter((b) => b.ceoLayer === layer)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            const firstBinding = layerBindings[0];
            const firstKey = firstBinding ? keyById.get(firstBinding.llmKeyId) : undefined;
            const prevLayer =
              cfg[layer] && typeof cfg[layer] === 'object' ? (cfg[layer] as Record<string, unknown>) : {};
            cfg[layer] = {
              ...prevLayer,
              modelName: firstKey?.modelName ?? null,
              keyIds: layerBindings.map((b) => b.llmKeyId),
            };
          }
          const strategyObj: Record<string, unknown> = {
            ...(typeof cfg.strategy === 'object' && cfg.strategy !== null && !Array.isArray(cfg.strategy)
              ? (cfg.strategy as Record<string, unknown>)
              : {}),
          };
          const contextPolicy: Record<string, unknown> = {
            ...(typeof strategyObj.contextPolicy === 'object' &&
            strategyObj.contextPolicy !== null &&
            !Array.isArray(strategyObj.contextPolicy)
              ? (strategyObj.contextPolicy as Record<string, unknown>)
              : {}),
          };
          const optionalPoolToContextPolicy = (ceoLayer: 'intent' | 'replay', key: 'intentLayer' | 'replay') => {
            const layerBindings = savedRows
              .filter((b) => b.ceoLayer === ceoLayer)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            if (!layerBindings.length) return;
            const firstBinding = layerBindings[0]!;
            const firstKey = keyById.get(firstBinding.llmKeyId);
            const prev =
              contextPolicy[key] && typeof contextPolicy[key] === 'object' && !Array.isArray(contextPolicy[key])
                ? ({ ...(contextPolicy[key] as Record<string, unknown>) } as Record<string, unknown>)
                : {};
            contextPolicy[key] = {
              ...prev,
              modelName: firstKey?.modelName ?? (typeof prev.modelName === 'string' ? prev.modelName : null),
              keyIds: layerBindings.map((b) => b.llmKeyId),
              llmKeyId: firstBinding.llmKeyId,
              keySource: 'dedicated',
            };
          };
          optionalPoolToContextPolicy('intent', 'intentLayer');
          optionalPoolToContextPolicy('replay', 'replay');
          strategyObj.contextPolicy = contextPolicy;
          cfg.strategy = strategyObj;
          agent.ceoLayerConfig = normalizeCeoLayerConfig(cfg);
          shouldPropagateCeoTemplate = true;
        } else {
          const sorted = sortMarketplaceBindings(normalized);
          const first = sorted.find((x) => x.ceoLayer === 'default') ?? sorted[0];
          const k0 = first ? keyById.get(first.llmKeyId) : undefined;
          agent.boundModelName = k0?.modelName ?? null;
        }
        await agents.save(agent);
      } else if (patch.isPublished === true) {
        let existingBindings = await bindings.find({ where: { marketplaceAgentId: id } });
        if (agent.slug === 'ceo') {
          const missingLayers = CEO_POOL_LAYERS.filter(
            (layer) => !existingBindings.some((b) => b.ceoLayer === layer),
          );
          if (missingLayers.length > 0) {
            const cfg = normalizeCeoLayerConfig(agent.ceoLayerConfig ?? {});
            const rowsFromConfig = CEO_POOL_LAYERS.flatMap((layer) => {
              const keyIds = Array.isArray((cfg as Record<string, any>)?.[layer]?.keyIds)
                ? ((cfg as Record<string, any>)[layer].keyIds as unknown[])
                    .map((x) => String(x ?? '').trim())
                    .filter(Boolean)
                : [];
              return keyIds.map((llmKeyId, sortOrder) => ({
                llmKeyId,
                sortOrder,
                ceoLayer: layer,
              }));
            });
            if (rowsFromConfig.length > 0) {
              const keyIds = Array.from(new Set(rowsFromConfig.map((r) => r.llmKeyId)));
              const keyRows = await llmKeys.find({ where: { id: In(keyIds) } as any });
              const validKeyIds = new Set(keyRows.map((k) => k.id));
              const filteredRows = rowsFromConfig.filter((r) => validKeyIds.has(r.llmKeyId));
              const seen = new Set<string>();
              for (const row of filteredRows) {
                if (seen.has(row.llmKeyId)) {
                  throw new BadRequestException('CEO 三层 keyIds 存在重复 llmKeyId，请确保每个 Key 仅绑定到一个层');
                }
                seen.add(row.llmKeyId);
              }
              if (filteredRows.length > 0) {
                await bindings.delete({ marketplaceAgentId: id } as any);
                const toSave = sortMarketplaceBindings(filteredRows).map((kb) =>
                  bindings.create({
                    marketplaceAgentId: id,
                    llmKeyId: kb.llmKeyId,
                    sortOrder: kb.sortOrder,
                    ceoLayer: kb.ceoLayer,
                  }),
                );
                await bindings.save(toSave);
                existingBindings = await bindings.find({ where: { marketplaceAgentId: id } });
              }
            }
          }
          for (const L of CEO_POOL_LAYERS) {
            if (!existingBindings.some((b) => b.ceoLayer === L)) {
              throw new BadRequestException(`上架前请为 CEO 每一层配置 Key 池（缺少 ${L}）`);
            }
          }
        } else if (!existingBindings.some((b) => (b.ceoLayer ?? 'default') === 'default')) {
          throw new BadRequestException('上架前请先配置 Key 池（模型由 Key 自动确定）');
        }
      }
    });

    if (shouldPropagateCeoTemplate) {
      const ceoTpl = await this.agentsRepo.findOne({ where: { id } });
      if (ceoTpl?.slug === 'ceo') {
        void this.ceoLayerConfigService
          .propagateMarketplaceCeoTemplateToAllCompanies(ceoTpl as MarketplaceAgent)
          .catch((err: unknown) => {
            this.logger.error(
              'propagateMarketplaceCeoTemplateToAllCompanies failed',
              err instanceof Error ? err.stack : String(err),
            );
          });
      }
    }

    if (patch.recommendedSkillVersionIds !== undefined) {
      const fresh = await this.agentsRepo.findOne({ where: { id } });
      await this.marketplaceSkillVersion.emitAfterRecommendedVersionPinsChanged({
        marketplaceAgentId: id,
        agentName: fresh?.name ?? '',
        prevPins: prevSkillPins,
        nextPins: fresh?.recommendedSkillVersionIds,
      });
    }

    if (shouldPropagateInstalledAgentsLlm) {
      await this.bindingsCache.invalidate(id);
      void this.agentsService
        .propagateMarketplaceTemplateLlmToInstalledAgents(id, {
          operatorUserId: patch.operatorUserId ?? null,
        })
        .catch((err: unknown) => {
          this.logger.error(
            'propagateMarketplaceTemplateLlmToInstalledAgents failed',
            err instanceof Error ? err.stack : String(err),
          );
        });

      const agentRow = await this.agentsRepo.findOne({ where: { id } });
      const maxCompanies = this.configService.getMarketplaceBindingNotifyMaxCompanies();
      const installRows = await this.dataSource.query<Array<{ company_id: string; agent_id: string }>>(
        `SELECT DISTINCT a.company_id::text AS company_id, a.id::text AS agent_id
         FROM agents a
         WHERE a.metadata IS NOT NULL
           AND a.metadata->>'marketplaceAgentId' = $1`,
        [id],
      );
      const companyIds = [
        ...new Set(installRows.map((r) => String(r.company_id).trim()).filter(Boolean)),
      ].slice(0, maxCompanies);
      const installedAgentTargets = installRows
        .map((r) => ({
          companyId: String(r.company_id).trim(),
          agentId: String(r.agent_id).trim(),
        }))
        .filter((t) => t.companyId && t.agentId)
        .slice(0, maxCompanies * 20);

      const evt: MarketplaceBindingUpdatedEvent = {
        eventId: randomUUID(),
        eventType: 'marketplace.binding.updated',
        aggregateId: id,
        aggregateType: 'marketplace_agent',
        occurredAt: new Date().toISOString(),
        version: 1,
        data: {
          marketplaceAgentId: id,
          agentName: agentRow?.name ?? '',
          changedFields: marketplaceAdminPatchChangedFieldNames(patch as Record<string, unknown>),
          updatedAt: new Date().toISOString(),
          companyIds,
          installedAgentTargets,
        },
      };
      await this.messagingService.publish(evt, {
        routingKey: 'marketplace.binding.updated',
        persistent: true,
      });
    }

    return { ok: true };
  }

  async publish(id: string): Promise<{ ok: true }> {
    return this.update(id, { isPublished: true });
  }

  async offline(id: string): Promise<{ ok: true }> {
    return this.update(id, { isPublished: false });
  }

  async clone(id: string): Promise<{ id: string; slug: string }> {
    const source = await this.agentsRepo.findOne({ where: { id } });
    if (!source) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '商品不存在',
      });
    }
    const meta = (source.metadata ?? {}) as Record<string, unknown>;
    const industryTags = Array.isArray(meta.industryTags) ? (meta.industryTags as string[]) : [];
    const recommendedForScales = Array.isArray(meta.recommendedForScales) ? (meta.recommendedForScales as string[]) : [];
    const version = typeof meta.version === 'string' ? meta.version : 'v1';
    const cloned = await this.create({
      name: `${source.name} (Clone)`,
      slug: `${source.slug}-clone`,
      iconUrl: source.iconUrl,
      description: source.description,
      expertise: source.expertise,
      systemPrompt: source.systemPrompt,
      recommendedSkills: Array.isArray(source.recommendedSkills) ? (source.recommendedSkills as string[]) : [],
      skillTags: Array.isArray(source.skillTags) ? source.skillTags : [],
      agentCategory: source.agentCategory,
      departmentRoles: Array.isArray(source.departmentRoles) ? source.departmentRoles : [],
      industryTags,
      version,
      recommendedForScales,
      // Clone defaults to draft and does not copy key bindings due cross-product uniqueness.
      isPublished: false,
    });
    const target = await this.agentsRepo.findOne({ where: { id: cloned.id } });
    if (target && source.slug === 'ceo') {
      target.ceoLayerConfig = normalizeCeoLayerConfig(source.ceoLayerConfig ?? {});
      target.recommendedSkillVersionIds = Array.isArray(source.recommendedSkillVersionIds)
        ? source.recommendedSkillVersionIds
        : null;
      await this.agentsRepo.save(target);
    }
    return cloned;
  }

  async remove(id: string): Promise<{ ok: true }> {
    const agent = await this.agentsRepo.findOne({ where: { id }, select: ['id', 'name'] });
    if (!agent) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '商品不存在',
      });
    }
    const [subscriptionCount, hireRequestCount] = await Promise.all([
      this.subscriptionsRepo.count({ where: { marketplaceAgentId: id } }),
      this.hireRequestsRepo.count({ where: { marketplaceAgentId: id } }),
    ]);
    if (subscriptionCount > 0 || hireRequestCount > 0) {
      throw new BadRequestException(
        `该商品已存在关联记录（订阅 ${subscriptionCount} 条，招聘申请 ${hireRequestCount} 条），不可删除。请先下架并停用关联数据。`,
      );
    }
    await this.bindingsCache.invalidate(id);
    await this.agentsRepo.delete({ id });
    return { ok: true };
  }

  async listAvailableKeys(params: {
    marketplaceAgentId: string;
    ceoLayer?: string;
    provider?: string;
    modelName?: string;
    isActive?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{
    items: Array<{
      id: string;
      provider: string;
      modelName: string;
      keyAlias: string;
      isActive: boolean;
      dailyQuotaTokens: string;
      usedTodayTokens: string;
      remainingTokens: string;
      assignedCompanyCount: string;
      lastUsedAt: Date | null;
      isBound: boolean;
    }>;
    total: number;
    page: number;
    pageSize: number;
    lockedProvider: string | null;
    lockedModelName: string | null;
    lockedCeoLayer: string;
    modelOptions: Array<{ provider: string; modelName: string; activeUnboundCount: number }>;
  }> {
    const pageRaw = Number(params.page);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const sizeRaw = Number(params.pageSize);
    const pageSize = Number.isFinite(sizeRaw) && sizeRaw >= 1 ? Math.min(100, Math.floor(sizeRaw)) : 20;
    const isActive = params.isActive ?? true;

    const agent = await this.agentsRepo.findOne({ where: { id: params.marketplaceAgentId } });
    if (!agent) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: '商品不存在' });
    }

    const normalizeLayer = (): string => {
      if (agent.slug !== 'ceo') return 'default';
      const L = String(params.ceoLayer ?? '').trim() as CeoPoolLayer;
      if (L === 'strategy' || L === 'orchestration' || L === 'supervision') return L;
      return 'strategy';
    };
    const layer = normalizeLayer();

    // Determine model/provider lock from the first bound key in this layer (if any).
    const lockRow = await this.bindingsRepo
      .createQueryBuilder('b')
      .innerJoin(LlmKey, 'k', 'k.id = b.llm_key_id')
      .select([
        'k.provider AS provider',
        'k.model_name AS "modelName"',
      ])
      .where('b.marketplace_agent_id = :agentId', { agentId: agent.id })
      .andWhere('b.ceo_layer = :layer', { layer })
      .orderBy('b.sort_order', 'ASC')
      .limit(1)
      .getRawOne<{ provider?: string; modelName?: string }>();

    const lockedProvider = (lockRow?.provider ?? '').trim() || null;
    const lockedModelName = (lockRow?.modelName ?? '').trim() || null;

    const baseQb = this.llmKeysRepo
      .createQueryBuilder('k')
      .where(isActive !== undefined ? 'k.isActive = :isActive' : '1=1', { isActive })
      // Only allow keys that are not bound anywhere in marketplace (global uniqueness).
      .andWhere(
        `not exists (select 1 from marketplace_agent_key_bindings b where b.llm_key_id = k.id)`,
      );

    if (lockedProvider && lockedModelName) {
      baseQb.andWhere('k.provider = :p', { p: lockedProvider });
      baseQb.andWhere('k.modelName = :m', { m: lockedModelName });
    } else {
      if (params.provider?.trim()) baseQb.andWhere('k.provider = :p2', { p2: params.provider.trim() });
      if (params.modelName?.trim()) baseQb.andWhere('k.modelName = :m2', { m2: params.modelName.trim() });
    }

    const total = await baseQb.clone().getCount();
    const keys = await baseQb
      .orderBy('k.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = keys.map((k) => k.id);
    const usageDate = toUsageDateUTC(new Date());
    const usageRows = ids.length
      ? await this.dailyUsageRepo.find({
          where: { llmKeyId: In(ids), usageDate } as any,
        })
      : [];
    const usageMap = new Map(usageRows.map((u) => [u.llmKeyId, u] as const));

    // assignedCompanyCount: reuse billing table aggregation (same as LlmKeysService)
    const companyAgg = ids.length
      ? await this.dataSource
          .createQueryBuilder()
          .from('billing_records', 'r')
          .select('r.llm_key_id', 'llmKeyId')
          .addSelect('COUNT(DISTINCT r.company_id)', 'companyCount')
          .where('r.llm_key_id IN (:...ids)', { ids })
          .groupBy('r.llm_key_id')
          .getRawMany<{ llmKeyId: string; companyCount: string }>()
      : [];
    const companyCountMap = new Map<string, number>();
    for (const row of companyAgg) companyCountMap.set(row.llmKeyId, Number(row.companyCount));

    const items = keys.map((k) => {
      const u = usageMap.get(k.id);
      const usedTodayTokens = u ? Number(u.usedTokens) : 0;
      const dailyQuotaTokens = Number(k.dailyQuotaTokens);
      return {
        id: k.id,
        provider: k.provider,
        modelName: k.modelName,
        keyAlias: k.keyAlias,
        isActive: k.isActive,
        dailyQuotaTokens: k.dailyQuotaTokens,
        usedTodayTokens: usedTodayTokens.toString(),
        remainingTokens: Math.max(0, dailyQuotaTokens - usedTodayTokens).toString(),
        assignedCompanyCount: (companyCountMap.get(k.id) ?? 0).toString(),
        lastUsedAt: k.lastUsedAt,
        isBound: false,
      };
    });

    // Model options are meaningful only when there is no lock yet.
    const modelOptions: Array<{ provider: string; modelName: string; activeUnboundCount: number }> = [];
    if (!lockedProvider || !lockedModelName) {
      const optRows = await this.llmKeysRepo
        .createQueryBuilder('k')
        .select('k.provider', 'provider')
        .addSelect('k.modelName', 'modelName')
        .addSelect('COUNT(*)::int', 'cnt')
        .where(isActive !== undefined ? 'k.isActive = :isActive' : '1=1', { isActive })
        .andWhere(`not exists (select 1 from marketplace_agent_key_bindings b where b.llm_key_id = k.id)`)
        .groupBy('k.provider')
        .addGroupBy('k.modelName')
        .orderBy('k.provider', 'ASC')
        .addOrderBy('k.modelName', 'ASC')
        .limit(200)
        .getRawMany<{ provider: string; modelName: string; cnt: number }>();
      for (const r of optRows) {
        modelOptions.push({
          provider: r.provider,
          modelName: r.modelName,
          activeUnboundCount: Number(r.cnt),
        });
      }
    }

    return {
      items,
      total,
      page,
      pageSize,
      lockedProvider,
      lockedModelName,
      lockedCeoLayer: layer,
      modelOptions,
    };
  }

  /**
   * 一键同步：将 `recommended_skills`（Skill **name**）解析为平台全局 UUID，
   * 并写入 CEO 三层 `ceo_layer_config.{strategy,orchestration,supervision}.skillIds`（覆盖每层的 skillIds，其它层字段保留）。
   * 同一批 Skill 可以同时出现在多层；Layer 只表达运行分层，不代表 Skill 类型归属。
   */
  async syncCeoLayersSkillIdsFromRecommended(
    agentId: string,
    opts?: { skillBindingValidationCompanyId?: string | null; operatorUserId?: string | null },
  ): Promise<
    | {
        ok: true;
        skillIds: string[];
        ceoLayerConfig: Record<string, unknown>;
      }
    | {
        ok: false;
        outcome: 'pending_approval';
        approvalRequestId: string;
        pendingSkillIds: string[];
        message: string;
        skillIds: string[];
      }
  > {
    const agent = await this.agentsRepo.findOne({ where: { id: agentId } });
    if (!agent) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '商品不存在',
      });
    }
    if (agent.slug !== 'ceo') {
      throw new BadRequestException(
        '仅 slug=ceo 的商城模板支持将 Recommended Skills 同步到三层 skillIds',
      );
    }
    const rawNames = Array.isArray(agent.recommendedSkills)
      ? (agent.recommendedSkills as unknown[])
          .map((x) => String(x ?? '').trim())
          .filter(Boolean)
      : [];
    const deduped = [...new Set(rawNames)];
    if (!deduped.length) {
      throw new BadRequestException('recommended_skills 为空，无法同步');
    }
    await this.recommendedSkillsValidator.assertAllGlobalSkillsExist(
      deduped,
      'sync_ceo_layer_skill_ids',
    );
    const skills = await this.skillsRepo
      .createQueryBuilder('s')
      .where('s.company_id IS NULL AND s.name IN (:...names)', { names: deduped })
      .getMany();
    const byName = new Map(skills.map((s) => [s.name, s.id]));
    const skillIds = deduped.map((n) => byName.get(n)!).filter(Boolean);

    const bindCid = opts?.skillBindingValidationCompanyId?.trim();
    if (bindCid && skillIds.length) {
      await this.tenantContext.runWithCompanyId(bindCid, () =>
        this.skillBindingValidator.validateSkillsBelongToCompany(bindCid, skillIds, {
          operatorId: opts?.operatorUserId ?? null,
          source: 'marketplace_admin_sync_ceo_layers',
        }),
      );
      const gate = await this.tenantContext.runWithCompanyId(bindCid, () =>
        this.skillBindingValidator.evaluateHighRiskSkillBindingApprovalGate({
          companyId: bindCid,
          skillIds,
          actorId: opts?.operatorUserId ?? null,
          bindingSurface: 'ceo_layer',
          context: { marketplaceAgentId: agentId },
          source: 'marketplace_admin_sync_ceo_layers',
        }),
      );
      if (isSkillBindingGatePending(gate)) {
        return {
          ok: false,
          outcome: 'pending_approval',
          approvalRequestId: gate.approvalRequestId,
          pendingSkillIds: gate.pendingSkillIds,
          message: gate.message,
          skillIds,
        };
      }
    }

    const cfg = normalizeCeoLayerConfig(agent.ceoLayerConfig ?? {});
    for (const layer of CEO_POOL_LAYERS) {
      const prev =
        cfg[layer] && typeof cfg[layer] === 'object'
          ? { ...(cfg[layer] as Record<string, unknown>) }
          : {};
      cfg[layer] = { ...prev, skillIds: [...skillIds] };
    }
    agent.ceoLayerConfig = normalizeCeoLayerConfig(cfg);
    await this.agentsRepo.save(agent);
    return { ok: true, skillIds, ceoLayerConfig: agent.ceoLayerConfig };
  }

}

