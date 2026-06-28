import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import type {
  AgentApprovedEvent,
  AgentCreatedEvent,
  AgentDeletedEvent,
  AgentNeedApprovalEvent,
  AgentStatusChangedEvent,
  AgentUpdatedEvent,
} from '@contracts/events';
import { getOrgTreeVersionCacheKey } from '../../../common/organization/org-tree-cache-keys.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import { MarketplaceBindingsCacheService } from '../../templates/marketplace-bindings-cache.service.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { Skill } from '../../skills/entities/skill.entity.js';
import { AssignAgentNodeDto } from '../dto/assign-agent-node.dto.js';
import { BatchRecruitDto } from '../dto/batch-recruit.dto.js';
import { CreateAgentDto } from '../dto/create-agent.dto.js';
import { QueryAgentAuditLogsDto } from '../dto/query-agent-audit.dto.js';
import { QueryAgentsDto } from '../dto/query-agents.dto.js';
import { RecruitTemplateDto } from '../dto/recruit-template.dto.js';
import { UpdateAgentDto } from '../dto/update-agent.dto.js';
import { UpdateAgentStatusDto } from '../dto/update-agent-status.dto.js';
import { Agent, type AgentRole, type AgentStatus } from '../entities/agent.entity.js';
import type { AgentAuditAction } from '../entities/agent-audit-log.entity.js';
import { AgentAuditLog } from '../entities/agent-audit-log.entity.js';
import { AgentSkillService } from './agent-skill.service.js';
import { AgentValidatorService } from './agent-validator.service.js';
import {
  isCeoLayerScopedContext,
  normalizeCeoLayer,
  selectPoolBindingsForAgent,
  shouldEnforceCeoLayerKeyPool,
} from './ceo-llm-key-pool-bindings.js';
import { SkillBindingValidatorService } from '../../skills/services/skill-binding-validator.service.js';
import { isSkillBindingGatePending } from '../../skills/services/skill-binding-validator.service.js';
import { EnforceModelType } from '../../../common/llm-rules/model-type.decorator.js';
import type { McpToolDefinition } from '@foundry/contracts/types/mcp.protocol';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  private readonly CACHE_TTL = 300;

  private isEmbeddingLikeModel(modelName: string | null | undefined): boolean {
    const n = String(modelName ?? '').trim().toLowerCase();
    if (!n) return false;
    return /\bembedding(s)?\b/.test(n) || n.includes('text-embedding') || n.includes('bge-');
  }

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(AgentAuditLog)
    private readonly auditRepo: Repository<AgentAuditLog>,
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    @InjectRepository(CompanyMarketplaceAgentKeyAssignment)
    private readonly keyAssignmentsRepo: Repository<CompanyMarketplaceAgentKeyAssignment>,
    private readonly marketplaceBindingsCache: MarketplaceBindingsCacheService,
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentsRepo: Repository<MarketplaceAgent>,
    @InjectRepository(LlmKey)
    private readonly llmKeysRepo: Repository<LlmKey>,
    private readonly tenantContext: TenantContextService,
    private readonly cacheService: CacheService,
    private readonly messagingService: MessagingService,
    private readonly validator: AgentValidatorService,
    private readonly agentSkillService: AgentSkillService,
    private readonly skillBindingValidator: SkillBindingValidatorService,
  ) {}

  private extractSkillIdsFromAgentMetadata(meta: unknown): string[] {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
    const m = meta as Record<string, unknown>;
    const raw = m['skillIds'];
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((x) => String(x ?? '').trim()).filter(Boolean))];
  }

  /**
   * 主管或员工挂到 `department` 节点时，若未显式配置 `allowDeptSharedMemory`，默认开启并落库，
   * 与 {@link EffectiveSkillsService.getDepartmentSharingContextForAgent} 中 director/executor 默认语义一致。
   */
  private deptSharedMemoryMetadataIfUnset(node: OrganizationNode, agentRole: AgentRole): Record<string, unknown> | null {
    if (node.type !== 'department') return null;
    if (agentRole !== 'director' && agentRole !== 'executor') return null;
    const base = { ...((node.metadata as Record<string, unknown> | null) ?? {}) };
    if (typeof base.allowDeptSharedMemory === 'boolean') return null;
    return { ...base, allowDeptSharedMemory: true };
  }

  private async resolveMarketplaceRecommendedSkillIds(mp: MarketplaceAgent): Promise<string[]> {
    const pinnedIds = Array.isArray(mp.recommendedSkillVersionIds)
      ? mp.recommendedSkillVersionIds.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    if (pinnedIds.length > 0) {
      return [...new Set(pinnedIds)];
    }
    const names = Array.isArray(mp.recommendedSkills)
      ? (mp.recommendedSkills as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    const dedupedNames = [...new Set(names)];
    if (!dedupedNames.length) {
      return [];
    }
    const rows = await this.dataSource
      .getRepository(Skill)
      .createQueryBuilder('s')
      .where('s.company_id IS NULL AND s.is_latest = :isLatest AND s.name IN (:...names)', {
        isLatest: true,
        names: dedupedNames,
      })
      .getMany();
    const byName = new Map(rows.map((s) => [s.name, s.id]));
    return dedupedNames.map((n) => byName.get(n)).filter((id): id is string => !!id);
  }

  private getCompanyIdOrThrow(): string {
    const companyId = this.tenantContext.getCompanyId();
    if (!companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Company ID is required',
      });
    }
    return companyId;
  }

  private getTreeCacheVersionKey(companyId: string): string {
    return getOrgTreeVersionCacheKey(companyId);
  }

  private async clearOrgTreeCache(companyId: string): Promise<void> {
    const versionKey = this.getTreeCacheVersionKey(companyId);
    const existed = await this.cacheService.exists(versionKey);
    if (!existed) {
      await this.cacheService.set(versionKey, 2, this.CACHE_TTL * 24);
      return;
    }
    await this.cacheService.increment(versionKey, 1);
    await this.cacheService.expire(versionKey, this.CACHE_TTL * 24);
  }

  private agentCacheKey(companyId: string, agentId: string): string {
    return `company:${companyId}:agent:${agentId}`;
  }

  private async clearAgentCache(companyId: string, agentId?: string): Promise<void> {
    if (agentId) {
      await this.cacheService.delete(this.agentCacheKey(companyId, agentId));
    }
  }

  private toSerializableAgent(agent: Agent): Record<string, unknown> {
    return {
      id: agent.id,
      companyId: agent.companyId,
      organizationNodeId: agent.organizationNodeId,
      reportsToAgentId: agent.reportsToAgentId,
      hierarchyVersion: agent.hierarchyVersion,
      name: agent.name,
      role: agent.role,
      expertise: agent.expertise,
      avatarUrl: agent.avatarUrl,
      systemPrompt: agent.systemPrompt,
      llmModel: agent.llmModel,
      personality: agent.personality,
      status: agent.status,
      humanInLoop: agent.humanInLoop,
      pendingConfig: agent.pendingConfig,
      metadata: agent.metadata,
    };
  }

  private async recordAudit(
    companyId: string,
    agentId: string,
    action: AgentAuditAction,
    beforeState: Record<string, unknown> | null,
    afterState: Record<string, unknown> | null,
    actorId?: string,
    /** 与 Agent 写入同一事务时使用，否则审计 INSERT 在另一连接可见不到未提交的 agent 行，会触发 FK 失败 */
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(AgentAuditLog) : this.auditRepo;
    await repo.save(
      repo.create({
        companyId,
        userId: actorId ?? null,
        agentId,
        action,
        beforeState,
        afterState,
      }),
    );
  }

  private async assertCeoUnique(companyId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Agent) : this.agentsRepo;
    const n = await repo.count({ where: { companyId, role: 'ceo' as AgentRole } });
    if (n > 0) {
      throw new ConflictException({
        code: ErrorCode.RECORD_ALREADY_EXISTS,
        message: '公司已存在 CEO Agent',
      });
    }
  }

  async findAll(query: QueryAgentsDto): Promise<{
    items: Agent[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const companyId = this.getCompanyIdOrThrow();
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.agentsRepo
      .createQueryBuilder('a')
      .where('a.company_id = :companyId', { companyId })
      .orderBy('a.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.organizationNodeId) {
      qb.andWhere('a.organization_node_id = :nid', { nid: query.organizationNodeId });
    }
    if (query.role) {
      qb.andWhere('a.role = :role', { role: query.role });
    }
    if (query.status) {
      qb.andWhere('a.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere('(a.name ILIKE :s OR a.expertise ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }

    // Temporary agents are project-scoped (metadata.projectId). Hide them in company-wide view.
    // If projectId is provided: include permanent agents + temporary agents matching projectId.
    if (query.projectId) {
      qb.andWhere(
        `(COALESCE(a.metadata->>'employmentType','permanent') <> 'temporary' OR a.metadata->>'projectId' = :pid)`,
        { pid: query.projectId },
      );
    } else {
      qb.andWhere(`COALESCE(a.metadata->>'employmentType','permanent') <> 'temporary'`);
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  async findOne(id: string): Promise<Agent & { skillIds: string[] }> {
    const companyId = this.getCompanyIdOrThrow();
    const cacheKey = this.agentCacheKey(companyId, id);
    const cached = await this.cacheService.get<Agent>(cacheKey);
    let agent: Agent | null = cached ?? null;
    if (!agent) {
      agent = await this.agentsRepo.findOne({ where: { id, companyId } });
      if (!agent) {
        throw new NotFoundException({
          code: ErrorCode.RECORD_NOT_FOUND,
          message: 'Agent 不存在',
        });
      }
      await this.cacheService.set(cacheKey, agent, this.CACHE_TTL);
    }
    const skillIds = await this.agentSkillService.listSkillIdsForAgent(id, companyId);
    return { ...agent, skillIds };
  }

  @EnforceModelType('chat')
  async resolveLlmKeyPoolCandidates(
    id: string,
    ceoContext?: string,
  ): Promise<{ llmKeyIds: string[]; source: string; exclusiveReplayKeyPool: boolean; exclusiveMarketplaceKeyPool?: boolean }> {
    const companyId = this.getCompanyIdOrThrow();
    const agent = await this.agentsRepo.findOne({ where: { id, companyId } });
    if (!agent) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Agent 不存在',
      });
    }

    const safeContext = ceoContext ? String(ceoContext).trim() : '';

    const marketplaceAgentId =
      agent.metadata && typeof (agent.metadata as any).marketplaceAgentId === 'string'
        ? String((agent.metadata as any).marketplaceAgentId).trim()
        : '';
    if (!marketplaceAgentId) {
      return {
        llmKeyIds: agent.llmKeyId ? [agent.llmKeyId] : [],
        source: 'agent_only',
        exclusiveReplayKeyPool: false,
      };
    }
    const [assignment, bindingsAll, marketplaceAgent] = await Promise.all([
      this.keyAssignmentsRepo.findOne({ where: { companyId, marketplaceAgentId } }),
      this.marketplaceBindingsCache.findBindingsOrdered(marketplaceAgentId),
      this.marketplaceAgentsRepo.findOne({
        where: { id: marketplaceAgentId },
        select: ['id', 'boundModelName'],
      }),
    ]);
    const boundModelName = marketplaceAgent?.boundModelName?.trim() || '';

    const poolBindings = selectPoolBindingsForAgent({
      role: agent.role,
      safeContext,
      bindings: bindingsAll as any[],
    });

    const replayMarketplaceBindingCount = (bindingsAll as any[]).filter(
      (b) => normalizeCeoLayer((b as { ceoLayer?: unknown }).ceoLayer) === 'replay',
    ).length;

    const bindingKeyIds = poolBindings.map((b) => b.llmKeyId).filter(Boolean);
    const layerPool = new Set(bindingKeyIds);
    const ceoLayerScoped = agent.role === 'ceo' && isCeoLayerScopedContext(safeContext);
    const layerScopedEnforcePool = shouldEnforceCeoLayerKeyPool(ceoLayerScoped, layerPool.size);

    const ordered: string[] = [];
    const push = (id: string | null | undefined) => {
      const s = id ? String(id).trim() : '';
      if (!s || ordered.includes(s)) return;
      if (layerScopedEnforcePool && !layerPool.has(s)) return;
      ordered.push(s);
    };

    // 1) 公司显式偏好（仍在当前 layer 池内时才生效）
    push(assignment?.preferredLlmKeyId);
    // 2) 最新商城 bindings（管理员改绑后优先被尝试）
    for (const kid of bindingKeyIds) push(kid);
    // 3) 遗留安装快照 Key（兜底；CEO layer 调用时仅在属于该 layer 池时加入）
    const legacyAssigned = assignment?.assignedLlmKeyId;
    if (legacyAssigned) {
      const s = String(legacyAssigned).trim();
      if (s) {
        if (layerScopedEnforcePool) {
          if (layerPool.has(s)) push(s);
        } else {
          push(s);
        }
      }
    }
    // 4) Agent 行上缓存的 Key
    push(agent.llmKeyId);

    const deduped = ordered;
    if (!deduped.length) {
      return { llmKeyIds: [], source: 'marketplace_pool_empty', exclusiveReplayKeyPool: false };
    }
    const keys = await this.llmKeysRepo.find({ where: deduped.map((id) => ({ id })) as any });
    const activeChat = new Set(
      keys
        .filter((k) => k.isActive)
        .filter((k) => !this.isEmbeddingLikeModel(k.modelName))
        .filter((k) => !boundModelName || k.modelName === boundModelName)
        .map((k) => k.id),
    );
    const filtered = deduped.filter((id) => activeChat.has(id));
    if (filtered.length !== deduped.length) {
      this.logger.warn('resolved llm key pool contains non-chat or inactive keys; filtered', {
        companyId,
        agentId: id,
        ceoContext: safeContext || null,
        before: deduped.length,
        after: filtered.length,
      });
    }
    return {
      llmKeyIds: filtered,
      source: 'marketplace_pool',
      /** Worker：仅当商城确有 replay 层 binding 时 Replay 路径禁止回落全局 acquire */
      exclusiveReplayKeyPool: safeContext === 'replay' && replayMarketplaceBindingCount > 0,
      /** 商城安装实例：仅允许使用模板 Key 池，禁止全局 llmKeys.acquire 回落 */
      exclusiveMarketplaceKeyPool: true,
    };
  }

  /**
   * 商城模板任意配置变更后：为所有已安装该公司的租户 Agent 全量对齐模板快照。
   */
  async propagateMarketplaceTemplateLlmToInstalledAgents(
    marketplaceAgentId: string,
    options?: { operatorUserId?: string | null },
  ): Promise<{ agentsUpdated: number; failures: number }> {
    const mpId = marketplaceAgentId.trim();
    if (!mpId) {
      return { agentsUpdated: 0, failures: 0 };
    }

    const rows = await this.dataSource.query<Array<{ company_id: string; agent_id: string }>>(
      `SELECT DISTINCT a.company_id::text AS company_id, a.id::text AS agent_id
       FROM agents a
       WHERE a.metadata IS NOT NULL
         AND a.metadata->>'marketplaceAgentId' = $1`,
      [mpId],
    );

    const actor: Actor = {
      id: options?.operatorUserId?.trim() || 'system-marketplace-propagation',
      roles: ['admin'],
    };

    let agentsUpdated = 0;
    let failures = 0;
    for (const row of rows) {
      const companyId = String(row.company_id ?? '').trim();
      const agentId = String(row.agent_id ?? '').trim();
      if (!companyId || !agentId) continue;
      try {
        await this.tenantContext.runWithCompanyId(companyId, () =>
          this.refreshMarketplaceLlmSnapshot(agentId, actor),
        );
        agentsUpdated += 1;
      } catch (err: unknown) {
        failures += 1;
        this.logger.warn('propagateMarketplaceTemplateLlm: agent sync failed', {
          marketplaceAgentId: mpId,
          companyId,
          agentId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.log('propagateMarketplaceTemplateLlm: completed', {
      marketplaceAgentId: mpId,
      agentsUpdated,
      failures,
      totalTargets: rows.length,
    });
    return { agentsUpdated, failures };
  }

  /**
   * 将 Agent 配置与商城模板对齐：
   * - 名称、专长、系统提示、头像
   * - 模型/Key 快照（计费单价以 platform model_pricing 为准）
   * - marketplace 推荐技能（增量绑定 + 清理上一轮商城同步留下的技能）
   * - mcpTools 元数据 + ToolRegistry 运行时注册
   * - 模板 metadata（industryTags、version 等）
   */
  async refreshMarketplaceLlmSnapshot(id: string, actor: Actor): Promise<Agent & { skillIds: string[] }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);

    const agentRow = await this.agentsRepo.findOne({ where: { id, companyId } });
    if (!agentRow) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Agent 不存在',
      });
    }

    const mpId =
      agentRow.metadata &&
      typeof (agentRow.metadata as { marketplaceAgentId?: unknown }).marketplaceAgentId === 'string'
        ? String((agentRow.metadata as { marketplaceAgentId: string }).marketplaceAgentId).trim()
        : '';
    if (!mpId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '该 Agent 非商城安装实例，无法同步商城模型配置',
      });
    }

    const before = this.toSerializableAgent(agentRow) as Record<string, unknown>;

    const ceoCtx = agentRow.role === 'ceo' ? 'heavy' : undefined;
    const pool = await this.resolveLlmKeyPoolCandidates(id, ceoCtx);
    const firstKeyId = pool.llmKeyIds[0];
    const key = firstKeyId ? await this.llmKeysRepo.findOne({ where: { id: firstKeyId } }) : null;

    const mp = await this.marketplaceAgentsRepo.findOne({ where: { id: mpId } });

    agentRow.llmKeyId = firstKeyId ?? null;
    agentRow.llmModel = key?.modelName?.trim() || mp?.boundModelName?.trim() || agentRow.llmModel;

    if (mp) {
      const templateName = mp.name?.trim();
      if (templateName) {
        agentRow.name = templateName;
      }
      agentRow.expertise = mp.expertise ?? null;
      agentRow.systemPrompt = mp.systemPrompt ?? null;
      const iconUrl = mp.iconUrl?.trim();
      if (iconUrl) {
        agentRow.avatarUrl = iconUrl.slice(0, 500);
      }
    }

    const nextMarketplaceSkillIds = mp ? await this.resolveMarketplaceRecommendedSkillIds(mp) : [];
    if (nextMarketplaceSkillIds.length > 0) {
      await this.skillBindingValidator.validateSkillsBelongToCompany(companyId, nextMarketplaceSkillIds, {
        operatorId: actor.id,
        source: 'agents.refreshMarketplaceLlmSnapshot',
      });
      const gate = await this.skillBindingValidator.evaluateHighRiskSkillBindingApprovalGate({
        companyId,
        skillIds: nextMarketplaceSkillIds,
        actorId: actor.id,
        bindingSurface: 'agent',
        context: { agentId: id, marketplaceAgentId: mpId },
        source: 'agents.refreshMarketplaceLlmSnapshot',
      });
      if (isSkillBindingGatePending(gate)) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: gate.message,
          outcome: 'pending_approval',
          approvalRequestId: gate.approvalRequestId,
          pendingSkillIds: gate.pendingSkillIds,
        });
      }
    }

    const meta = { ...(agentRow.metadata ?? {}) } as Record<string, unknown>;
    const prevSyncedSkillIds = this.extractSkillIdsFromAgentMetadata(agentRow.metadata);
    if (prevSyncedSkillIds.length > 0) {
      const stale = prevSyncedSkillIds.filter((skillId) => !nextMarketplaceSkillIds.includes(skillId));
      if (stale.length > 0) {
        await this.agentSkillService.unbindSkills(id, { skillIds: stale }, actor);
      }
    }
    if (nextMarketplaceSkillIds.length > 0) {
      await this.agentSkillService.bindSkills(
        id,
        { skillIds: nextMarketplaceSkillIds, source: 'marketplace_sync' },
        actor,
      );
    }

    const marketplaceTools: McpToolDefinition[] = Array.isArray((mp as any)?.mcpTools)
      ? (((mp as any).mcpTools as unknown[]).filter((t) => !!t && typeof t === 'object') as McpToolDefinition[])
      : [];
    meta.mcpTools = marketplaceTools;
    await this.agentSkillService.registerMcpToolsForAgent({
      companyId,
      agentId: id,
      tools: marketplaceTools,
    });

    meta.skillIds = nextMarketplaceSkillIds;
    meta.marketplaceConfigSyncedAt = new Date().toISOString();
    meta.marketplaceConfigPoolSource = pool.source;
    if (mp) {
      meta.marketplaceSlug = mp.slug;
      const templateMeta = (mp.metadata ?? {}) as Record<string, unknown>;
      if (Array.isArray(templateMeta.industryTags)) {
        meta.industryTags = templateMeta.industryTags;
      }
      if (typeof templateMeta.version === 'string' && templateMeta.version.trim()) {
        meta.marketplaceTemplateVersion = templateMeta.version.trim();
      }
      if (Array.isArray(templateMeta.recommendedForScales)) {
        meta.recommendedForScales = templateMeta.recommendedForScales;
      }
      if (Array.isArray(mp.skillTags) && mp.skillTags.length > 0) {
        meta.marketplaceSkillTags = mp.skillTags;
      }
    }
    agentRow.metadata = meta;

    const updated = await this.agentsRepo.save(agentRow);
    await this.clearAgentCache(companyId, id);
    await this.recordAudit(
      companyId,
      id,
      'update',
      before,
      this.toSerializableAgent(updated) as Record<string, unknown>,
      actor.id,
    );
    await this.publishUpdated(updated, before);
    await this.marketplaceBindingsCache.invalidate(mpId);
    return this.findOne(id);
  }

  async create(dto: CreateAgentDto, actor: Actor): Promise<Agent> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);
    const metaSkillIds = this.extractSkillIdsFromAgentMetadata(dto.metadata);
    if (metaSkillIds.length) {
      await this.skillBindingValidator.validateSkillsBelongToCompany(companyId, metaSkillIds, {
        operatorId: actor.id,
        source: 'agents.create.metadata.skillIds',
      });
    }
    const node = await this.validator.assertNodeExists(dto.organizationNodeId, companyId);
    this.validator.assertRoleMatchesNode(node, dto.role);
    this.validator.assertNodeHasNoAgent(node);
    if (dto.role === 'ceo') {
      await this.assertCeoUnique(companyId);
    }

    const agent = await this.dataSource.transaction(async (manager) => {
      const agents = manager.getRepository(Agent);
      const nodes = manager.getRepository(OrganizationNode);
      const saved = await agents.save(
        agents.create({
          companyId,
          organizationNodeId: node.id,
          name: dto.name,
          role: dto.role,
          expertise: dto.expertise ?? null,
          avatarUrl: dto.avatarUrl ?? null,
          systemPrompt: dto.systemPrompt ?? null,
          llmModel: dto.llmModel ?? null,
          llmKeyId: dto.llmKeyId ?? null,
          reportsToAgentId: null,
          hierarchyVersion: 1,
          personality: dto.personality ?? null,
          status: 'active',
          humanInLoop: dto.humanInLoop ?? false,
          pendingConfig: null,
          metadata: dto.metadata ?? null,
        }),
      );
      const deptMemMeta = this.deptSharedMemoryMetadataIfUnset(node, dto.role);
      await nodes.update(
        { id: node.id, companyId },
        {
          agentId: saved.id,
          ...(deptMemMeta ? { metadata: deptMemMeta as Record<string, any> } : {}),
        },
      );
      await this.recordAudit(
        companyId,
        saved.id,
        'create',
        null,
        this.toSerializableAgent(saved) as Record<string, unknown>,
        actor.id,
        manager,
      );
      return saved;
    });

    await this.clearOrgTreeCache(companyId);
    await this.clearAgentCache(companyId, agent.id);
    await this.publishCreated(agent);
    return agent;
  }

  async recruitFromTemplate(
    organizationNodeId: string,
    template: RecruitTemplateDto,
    actor: Actor,
  ): Promise<Agent> {
    return this.create(
      {
        organizationNodeId,
        name: template.name,
        role: template.role,
        expertise: template.expertise,
        avatarUrl: template.avatarUrl,
        systemPrompt: template.systemPrompt,
        llmModel: template.llmModel,
        personality: template.personality,
        humanInLoop: template.humanInLoop,
        metadata: template.metadata,
      },
      actor,
    );
  }

  async batchRecruit(dto: BatchRecruitDto, actor: Actor): Promise<Agent[]> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);
    const created: Agent[] = [];
    for (const item of dto.items) {
      if (!item.organizationNodeId) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '批量招聘每项需提供 organizationNodeId',
        });
      }
      if (item.count === 1) {
        created.push(await this.recruitFromTemplate(item.organizationNodeId, item.template, actor));
        continue;
      }
      if (item.template.role !== 'executor') {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: 'count>1 时仅支持 role=executor，并在父节点下创建子 agent 节点',
        });
      }
      const parent = await this.validator.assertNodeExists(item.organizationNodeId, companyId);
      if (parent.type !== 'department' && parent.type !== 'ceo' && parent.type !== 'board') {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '批量执行岗需在 department/ceo/board 节点下创建',
        });
      }
      for (let i = 0; i < item.count; i += 1) {
        const child = this.nodesRepo.create({
          companyId,
          parentId: parent.id,
          type: 'agent',
          name: `${item.template.name} ${i + 1}`,
          description: null,
          order: i,
          metadata: { batchRecruited: true },
        });
        const savedNode = await this.nodesRepo.save(child);
        await this.clearOrgTreeCache(companyId);
        created.push(
          await this.recruitFromTemplate(
            savedNode.id,
            {
              ...item.template,
              name: `${item.template.name}-${i + 1}`,
            },
            actor,
          ),
        );
      }
    }
    return created;
  }

  async update(
    id: string,
    dto: UpdateAgentDto | undefined,
    actor: Actor,
  ): Promise<Agent | { status: string; pendingConfig: Record<string, unknown> }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);
    const patch =
      dto && typeof dto === 'object'
        ? (dto as UpdateAgentDto)
        : ({} as UpdateAgentDto);
    const agent = await this.findOne(id);
    const before = this.toSerializableAgent(agent) as Record<string, unknown>;

    const sensitiveKeys: (keyof UpdateAgentDto)[] = ['systemPrompt', 'llmModel', 'personality'];
    const touchesSensitive = sensitiveKeys.some(
      (k) => patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify((agent as any)[k]),
    );

    if (patch.metadata !== undefined) {
      const nextMeta = patch.metadata as Record<string, unknown>;
      const metaSkillIds = this.extractSkillIdsFromAgentMetadata(nextMeta);
      if (metaSkillIds.length) {
        await this.skillBindingValidator.validateSkillsBelongToCompany(companyId, metaSkillIds, {
          operatorId: actor.id,
          source: 'agents.update.metadata.skillIds',
        });
      }
    }

    if (agent.humanInLoop && touchesSensitive) {
      const pending = { ...(agent.pendingConfig || {}), ...patch };
      agent.pendingConfig = pending as Record<string, unknown>;
      await this.agentsRepo.save(agent);
      await this.clearAgentCache(companyId, id);
      await this.recordAudit(companyId, id, 'update', before, { pendingConfig: pending }, actor.id);
      const pendingFields = sensitiveKeys.filter((k) => patch[k] !== undefined) as string[];
      const needApproval: AgentNeedApprovalEvent = {
        eventId: randomUUID(),
        eventType: 'agent.need_approval',
        aggregateId: id,
        aggregateType: 'agent',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          companyId,
          agentId: id,
          requestedBy: actor.id,
          pendingFields,
          requestedAt: new Date().toISOString(),
        },
      };
      await this.messagingService.publish(needApproval, {
        routingKey: needApproval.eventType,
        persistent: true,
      });
      return { status: 'pending', pendingConfig: pending as Record<string, unknown> };
    }

    Object.assign(agent, {
      ...('name' in patch && patch.name !== undefined ? { name: patch.name } : {}),
      ...('role' in patch && patch.role !== undefined ? { role: patch.role } : {}),
      ...('expertise' in patch && patch.expertise !== undefined ? { expertise: patch.expertise } : {}),
      ...('avatarUrl' in patch && patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
      ...('systemPrompt' in patch && patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
      ...('llmModel' in patch && patch.llmModel !== undefined ? { llmModel: patch.llmModel } : {}),
      ...('llmKeyId' in patch && patch.llmKeyId !== undefined ? { llmKeyId: patch.llmKeyId } : {}),
      ...('personality' in patch && patch.personality !== undefined ? { personality: patch.personality } : {}),
      ...('humanInLoop' in patch && patch.humanInLoop !== undefined ? { humanInLoop: patch.humanInLoop } : {}),
      ...('metadata' in patch && patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
    });

    const updated = await this.agentsRepo.save(agent);
    await this.clearAgentCache(companyId, id);
    await this.recordAudit(companyId, id, 'update', before, this.toSerializableAgent(updated) as Record<string, unknown>, actor.id);
    await this.publishUpdated(updated, before);
    return updated;
  }

  async approve(id: string, actor: Actor): Promise<Agent> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);
    const agent = await this.findOne(id);
    if (!agent.pendingConfig || Object.keys(agent.pendingConfig).length === 0) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '无待审批配置',
      });
    }
    const before = this.toSerializableAgent(agent) as Record<string, unknown>;
    const p = agent.pendingConfig as Record<string, unknown>;
    if (typeof p.name === 'string') agent.name = p.name;
    if (typeof p.role === 'string') agent.role = p.role as AgentRole;
    if (p.expertise !== undefined) agent.expertise = p.expertise as string | null;
    if (p.avatarUrl !== undefined) agent.avatarUrl = p.avatarUrl as string | null;
    if (p.systemPrompt !== undefined) agent.systemPrompt = p.systemPrompt as string | null;
    if (p.llmModel !== undefined) agent.llmModel = p.llmModel as string | null;
    if (p.llmKeyId !== undefined) agent.llmKeyId = p.llmKeyId as string | null;
    if (p.personality !== undefined) agent.personality = p.personality as Record<string, unknown> | null;
    if (p.humanInLoop !== undefined) agent.humanInLoop = !!p.humanInLoop;
    if (p.metadata !== undefined) agent.metadata = p.metadata as Record<string, unknown> | null;
    agent.pendingConfig = null;
    const updated = await this.agentsRepo.save(agent);
    await this.clearAgentCache(companyId, id);
    await this.recordAudit(companyId, id, 'approve', before, this.toSerializableAgent(updated) as Record<string, unknown>, actor.id);
    const event: AgentApprovedEvent = {
      eventId: randomUUID(),
      eventType: 'agent.approved',
      aggregateId: updated.id,
      aggregateType: 'agent',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: {
        companyId,
        agentId: updated.id,
        approvedBy: actor.id,
        appliedFields: Object.keys(p),
        approvedAt: new Date().toISOString(),
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
    return updated;
  }

  async remove(id: string, actor: Actor): Promise<{ success: true }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);
    const agent = await this.findOne(id);
    const before = this.toSerializableAgent(agent) as Record<string, unknown>;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(AgentAuditLog).save(
        manager.getRepository(AgentAuditLog).create({
          companyId,
          userId: actor.id,
          agentId: id,
          action: 'delete',
          beforeState: before,
          afterState: null,
        }),
      );
      await manager.getRepository(OrganizationNode).update(
        { companyId, agentId: id },
        { agentId: null },
      );
      await manager.getRepository(Agent).delete({ id, companyId });
    });

    await this.clearOrgTreeCache(companyId);
    await this.clearAgentCache(companyId, id);
    const event: AgentDeletedEvent = {
      eventId: randomUUID(),
      eventType: 'agent.deleted',
      aggregateId: id,
      aggregateType: 'agent',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: {
        companyId,
        agentId: id,
        deletedAt: new Date().toISOString(),
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
    return { success: true };
  }

  async assignToNode(id: string, dto: AssignAgentNodeDto, actor: Actor): Promise<Agent> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);
    const agent = await this.findOne(id);
    const target = await this.validator.assertNodeExists(dto.organizationNodeId, companyId);
    this.validator.assertRoleMatchesNode(target, agent.role);
    this.validator.assertNodeHasNoAgent(target);

    const before = this.toSerializableAgent(agent) as Record<string, unknown>;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(OrganizationNode).update(
        { companyId, agentId: id },
        { agentId: null },
      );
      const deptMemMeta = this.deptSharedMemoryMetadataIfUnset(target, agent.role);
      await manager.getRepository(OrganizationNode).update(
        { id: target.id, companyId },
        {
          agentId: id,
          ...(deptMemMeta ? { metadata: deptMemMeta as Record<string, any> } : {}),
        },
      );
      agent.organizationNodeId = target.id;
      await manager.getRepository(Agent).save(agent);
      await manager.getRepository(AgentAuditLog).save(
        manager.getRepository(AgentAuditLog).create({
          companyId,
          userId: actor.id,
          agentId: id,
          action: 'assign_node',
          beforeState: before,
          afterState: this.toSerializableAgent(agent) as Record<string, unknown>,
        }),
      );
    });

    await this.clearOrgTreeCache(companyId);
    await this.clearAgentCache(companyId, id);
    await this.publishUpdated(agent, before);
    return this.findOne(id);
  }

  async updateStatus(id: string, dto: UpdateAgentStatusDto, actor: Actor): Promise<Agent> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);
    const agent = await this.findOne(id);
    const from = agent.status;
    if (from === dto.status) return agent;
    const before = this.toSerializableAgent(agent) as Record<string, unknown>;
    agent.status = dto.status;
    const updated = await this.agentsRepo.save(agent);
    await this.clearAgentCache(companyId, id);
    await this.recordAudit(
      companyId,
      id,
      'status_change',
      before,
      this.toSerializableAgent(updated) as Record<string, unknown>,
      actor.id,
    );
    const event: AgentStatusChangedEvent = {
      eventId: randomUUID(),
      eventType: 'agent.status_changed',
      aggregateId: id,
      aggregateType: 'agent',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: {
        companyId,
        agentId: id,
        fromStatus: from as AgentStatus,
        toStatus: dto.status,
        changedAt: new Date().toISOString(),
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
    return updated;
  }

  async queryAuditLogs(query: QueryAgentAuditLogsDto) {
    const companyId = this.getCompanyIdOrThrow();
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.auditRepo
      .createQueryBuilder('log')
      .where('log.company_id = :companyId', { companyId })
      .orderBy('log.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.agentId) qb.andWhere('log.agent_id = :aid', { aid: query.agentId });
    if (query.action) qb.andWhere('log.action = :action', { action: query.action });
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async listDirectSubordinates(supervisorAgentId: string): Promise<Agent[]> {
    const companyId = this.getCompanyIdOrThrow();
    const byHierarchy = await this.agentsRepo.find({
      where: { companyId, reportsToAgentId: supervisorAgentId },
      order: { createdAt: 'ASC' },
    });
    if (byHierarchy.length > 0) {
      return byHierarchy;
    }
    const supervisor = await this.agentsRepo.findOne({
      where: { id: supervisorAgentId, companyId },
    });
    if (!supervisor?.organizationNodeId) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '主管 Agent 不存在或未绑定组织节点',
      });
    }
    const children = await this.nodesRepo.find({
      where: { companyId, parentId: supervisor.organizationNodeId },
    });
    const childAgentIds = children
      .map((x) => x.agentId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (!childAgentIds.length) return [];
    return this.agentsRepo.find({
      where: childAgentIds.map((id) => ({ id, companyId })),
      order: { createdAt: 'ASC' },
    });
  }

  async getSupervisorChain(agentId: string): Promise<
    Array<{
      nodeId: string;
      nodeName: string;
      nodeType: string;
      agentId: string | null;
      parentId: string | null;
    }>
  > {
    const companyId = this.getCompanyIdOrThrow();
    const agent = await this.agentsRepo.findOne({ where: { id: agentId, companyId } });
    if (agent?.reportsToAgentId) {
      const chain: Array<{
        nodeId: string;
        nodeName: string;
        nodeType: string;
        agentId: string | null;
        parentId: string | null;
      }> = [];
      let cursor: Agent | null = agent;
      while (cursor) {
        chain.push({
          nodeId: cursor.organizationNodeId ?? cursor.id,
          nodeName: cursor.name,
          nodeType: 'agent',
          agentId: cursor.id,
          parentId: cursor.reportsToAgentId,
        });
        if (!cursor.reportsToAgentId) break;
        cursor =
          (await this.agentsRepo.findOne({
            where: { id: cursor.reportsToAgentId, companyId },
          })) ?? null;
      }
      return chain;
    }
    if (!agent?.organizationNodeId) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Agent 不存在或未绑定组织节点',
      });
    }
    const rows = await this.nodesRepo.query(
      `
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, type, name, agent_id, 0 depth
        FROM organization_nodes
        WHERE company_id = $1 AND id = $2
        UNION ALL
        SELECT n.id, n.parent_id, n.type, n.name, n.agent_id, c.depth + 1
        FROM organization_nodes n
        INNER JOIN chain c ON c.parent_id = n.id
        WHERE n.company_id = $1
      )
      SELECT id as "nodeId", name as "nodeName", type as "nodeType", agent_id as "agentId", parent_id as "parentId"
      FROM chain
      ORDER BY depth ASC
      `,
      [companyId, agent.organizationNodeId],
    );
    return rows as Array<{
      nodeId: string;
      nodeName: string;
      nodeType: string;
      agentId: string | null;
      parentId: string | null;
    }>;
  }

  private async publishCreated(agent: Agent): Promise<void> {
    const event: AgentCreatedEvent = {
      eventId: randomUUID(),
      eventType: 'agent.created',
      aggregateId: agent.id,
      aggregateType: 'agent',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: agent.companyId,
      data: {
        companyId: agent.companyId,
        agentId: agent.id,
        organizationNodeId: agent.organizationNodeId || undefined,
        name: agent.name,
        role: agent.role,
        llmModel: agent.llmModel || undefined,
        status: agent.status as AgentStatus,
        createdAt: agent.createdAt.toISOString(),
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
  }

  private async publishUpdated(agent: Agent, before: Record<string, unknown>): Promise<void> {
    const after = this.toSerializableAgent(agent) as Record<string, unknown>;
    const changes: Record<string, unknown> = {};
    for (const k of Object.keys(after)) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = after[k];
    }
    if (Object.keys(changes).length === 0) return;
    const event: AgentUpdatedEvent = {
      eventId: randomUUID(),
      eventType: 'agent.updated',
      aggregateId: agent.id,
      aggregateType: 'agent',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: agent.companyId,
      data: {
        companyId: agent.companyId,
        agentId: agent.id,
        changes,
        updatedAt: agent.updatedAt.toISOString(),
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
  }
}
