import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { normalizeCeoLayerConfig } from '@foundry/skills';
import { SkillBindingValidatorService } from '../../skills/services/skill-binding-validator.service.js';
import { SkillsService } from '../../skills/services/skills.service.js';
import { CeoLayerConfigService } from '../../companies/services/ceo-layer-config.service.js';
import type { DepartmentPlacementDto } from '../../companies/dto/department-placement.dto.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import { MarketplaceAgentKeyBinding } from '../../templates/entities/marketplace-agent-key-binding.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { Agent } from '../entities/agent.entity.js';
import { AgentAuditLog } from '../entities/agent-audit-log.entity.js';
import { AgentSkillService } from './agent-skill.service.js';
import { SQL_SET_LOCAL_CURRENT_TENANT } from '@service/tenant';
import { DepartmentHeadResolverService } from './department-head-resolver.service.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';
import { BootstrapSkillCatalogService } from './bootstrap-skill-catalog.service.js';
import { mergeDepartmentHeadRecommendedSkills, mergeEmployeeBootstrapSkillNames } from '@contracts/types';
import type { McpToolDefinition } from '@foundry/contracts/types/mcp.protocol';

/**
 * 公司组织初始化后创建默认 CEO / 部门主管 / 向导成员 Agent（幂等）。
 */
@Injectable()
export class AgentsBootstrapService {
  private readonly logger = new Logger(AgentsBootstrapService.name);
  private readonly ceoMemoryPermissions = ['memory:company:readwrite'] as const;
  private readonly ceoMarketplaceSlug = 'ceo';

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(AgentAuditLog)
    private readonly auditRepo: Repository<AgentAuditLog>,
    @InjectRepository(LlmKey)
    private readonly llmKeysRepo: Repository<LlmKey>,
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentsRepo: Repository<MarketplaceAgent>,
    @InjectRepository(MarketplaceAgentKeyBinding)
    private readonly keyBindingsRepo: Repository<MarketplaceAgentKeyBinding>,
    @InjectRepository(CompanyMarketplaceAgentKeyAssignment)
    private readonly keyAssignmentsRepo: Repository<CompanyMarketplaceAgentKeyAssignment>,
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    private readonly skillsService: SkillsService,
    private readonly agentSkillService: AgentSkillService,
    private readonly skillBindingValidator: SkillBindingValidatorService,
    private readonly deptHeadResolver: DepartmentHeadResolverService,
    private readonly platformSettings: PlatformSettingsService,
    @Inject(forwardRef(() => CeoLayerConfigService))
    private readonly ceoLayerConfigService: CeoLayerConfigService,
    private readonly bootstrapSkillCatalog: BootstrapSkillCatalogService,
  ) {}

  /**
   * 从商城 `slug=ceo` 模板 **原子**写入 `company_ceo_layer_configs`，再 **声明式** 将三层 skillIds 并集同步到 CEO Agent。
   * - `strict`：存在 CEO 组织节点上下文时必须存在模板与 CEO Agent，否则抛错（新建公司主路径）。
   * - `bestEffort`：模板或 CEO 暂缺时仅尽力写入公司行 / 跳过技能同步并打日志（如异步监听器抢跑）。
   */
  async atomicInitializeCeoLayers(
    companyId: string,
    mode: 'strict' | 'bestEffort',
  ): Promise<void> {
    const template = await this.fetchPublishedCeoMarketplaceTemplate();
    if (!template || String(template.slug) !== this.ceoMarketplaceSlug) {
      const msg = 'CEO marketplace template (slug=ceo) is required for company ceo_layer_config initialization';
      if (mode === 'strict') {
        throw new Error(msg);
      }
      this.logger.warn('atomicInitializeCeoLayers: template missing (bestEffort)', { companyId });
      return;
    }

    const merged = await this.ceoLayerConfigService.atomicEnsureAndSync(
      companyId,
      normalizeCeoLayerConfig(template.ceoLayerConfig ?? {}),
    );

    const ceo = await this.agentsRepo.findOne({
      where: { companyId, role: 'ceo' } as any,
    });
    if (!ceo?.id) {
      if (mode === 'strict') {
        throw new Error(
          `CEO agent is required to sync layer skills after bootstrap (companyId=${companyId})`,
        );
      }
      this.logger.warn('atomicInitializeCeoLayers: CEO agent absent; persisted company ceo_layer_config only', {
        companyId,
      });
      return;
    }

    await this.ceoLayerConfigService.syncLayerConfigToCeoAgent(companyId, ceo.id, merged);
    this.logger.log('CEO layers atomic init: company row + agent_skills union sync', {
      companyId,
      ceoAgentId: ceo.id,
      marketplaceAgentId: template.id,
      layerKeys: Object.keys(merged ?? {}),
    });
  }

  private async fetchPublishedCeoMarketplaceTemplate(): Promise<MarketplaceAgent | null> {
    return (
      (await this.marketplaceAgentsRepo.findOne({
        where: { slug: this.ceoMarketplaceSlug, isPublished: true } as any,
      })) ??
      (await this.marketplaceAgentsRepo.findOne({
        where: { slug: this.ceoMarketplaceSlug } as any,
      }))
    );
  }

  private async resolveMarketplaceCeoBootstrap(companyId: string): Promise<{
    chatModel: string | null;
    chatKeyId: string | null;
    skillIds: string[];
    templateId: string | null;
    mcpTools: McpToolDefinition[];
  }> {
    const template =
      (await this.marketplaceAgentsRepo.findOne({
        where: { slug: this.ceoMarketplaceSlug, isPublished: true } as any,
      })) ??
      (await this.marketplaceAgentsRepo.findOne({
        where: { slug: this.ceoMarketplaceSlug } as any,
      }));
    if (!template) {
      return {
        chatModel: null,
        chatKeyId: null,
        skillIds: [],
        templateId: null,
        mcpTools: [],
      };
    }
    const assigned = await this.allocateCompanyMarketplaceKey(companyId, template);
    return {
      chatModel: assigned?.modelName ?? template.boundModelName ?? null,
      chatKeyId: assigned?.id ?? null,
      /** 不再根据商城模板 recommendedSkills 自动绑定；CEO 技能由 ceo_layer_config 同步 + 手动配置 */
      skillIds: [] as string[],
      templateId: template.id,
      mcpTools: Array.isArray((template as any).mcpTools) ? ((template as any).mcpTools as McpToolDefinition[]) : [],
    };
  }

  private async lockBootstrapForCompany(manager: import('typeorm').EntityManager, companyId: string) {
    // Serialize bootstrap per company to avoid concurrent duplicate inserts (e.g. CEO unique index).
    // Uses transaction-scoped advisory lock: released automatically at tx end.
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [companyId]);
  }

  private async runInTenantTx<T>(
    companyId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      return work(manager);
    });
  }

  /**
   * 确保存在公司级商城 assignment，并返回一把用于引导期调用的代表性 Key（运行时以商城 bindings 池为准）。
   */
  async allocateCompanyMarketplaceKey(
    companyId: string,
    marketplaceAgent: MarketplaceAgent,
  ): Promise<LlmKey | null> {
    return await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);

      const assignments = manager.getRepository(CompanyMarketplaceAgentKeyAssignment);
      const llmKeys = manager.getRepository(LlmKey);
      const bindingsRaw = await manager
        .getRepository(MarketplaceAgentKeyBinding)
        .find({
          where: { marketplaceAgentId: marketplaceAgent.id },
          order: { sortOrder: 'ASC' },
        });

      const layerRank = (l: string) => {
        if (l === 'default') return 0;
        if (l === 'strategy') return 1;
        if (l === 'orchestration') return 2;
        if (l === 'supervision') return 3;
        return 9;
      };
      const bindingsSorted = [...bindingsRaw].sort(
        (a, b) =>
          layerRank((a as any).ceoLayer ?? 'default') - layerRank((b as any).ceoLayer ?? 'default') ||
          a.sortOrder - b.sortOrder,
      );

      const orderedBindings =
        marketplaceAgent.slug === 'ceo'
          ? (['strategy', 'orchestration', 'supervision'] as const).flatMap((layer) =>
              bindingsSorted.filter((b) => String((b as any).ceoLayer ?? '') === layer),
            )
          : bindingsSorted.filter((b) => String((b as any).ceoLayer ?? 'default') === 'default');

      if (!orderedBindings.length) {
        return null;
      }

      const candidateIds = orderedBindings.map((b) => b.llmKeyId);
      const keys = await llmKeys.find({ where: { id: In(candidateIds) } as any });
      const keyMap = new Map(keys.map((k) => [k.id, k] as const));

      const boundModelName = marketplaceAgent.boundModelName?.trim() || null;
      const orderedCandidates = orderedBindings
        .map((b) => keyMap.get(b.llmKeyId))
        .filter((k): k is LlmKey => !!k)
        .filter((k) => k.isActive)
        .filter((k) => (boundModelName ? k.modelName === boundModelName : true));

      if (!orderedCandidates.length) {
        return null;
      }

      const pickRepresentative = async (row: CompanyMarketplaceAgentKeyAssignment | null) => {
        if (!row) return orderedCandidates[0] ?? null;
        if (row.preferredLlmKeyId) {
          const pk = await llmKeys.findOne({ where: { id: row.preferredLlmKeyId } });
          if (pk?.isActive) return pk;
        }
        if (row.assignedLlmKeyId) {
          const ak = await llmKeys.findOne({ where: { id: row.assignedLlmKeyId } });
          if (ak?.isActive) return ak;
        }
        return orderedCandidates[0] ?? null;
      };

      const existing = await assignments.findOne({
        where: { companyId, marketplaceAgentId: marketplaceAgent.id },
      });
      if (existing) {
        return pickRepresentative(existing);
      }

      const assignedEmbeddingModelId =
        orderedBindings.map((b) => b.embeddingModelId).find((x) => !!x) ?? null;

      await assignments
        .createQueryBuilder()
        .insert()
        .into(CompanyMarketplaceAgentKeyAssignment)
        .values({
          companyId,
          marketplaceAgentId: marketplaceAgent.id,
          assignedLlmKeyId: null,
          preferredLlmKeyId: null,
          assignedEmbeddingModelId,
        })
        .orIgnore()
        .execute();

      const existingAfter = await assignments.findOne({
        where: { companyId, marketplaceAgentId: marketplaceAgent.id },
      });
      return pickRepresentative(existingAfter);
    });
  }

  private async bindBootstrapSkills(
    companyId: string,
    agentId: string,
    role: string,
  ): Promise<{ expectedNames: string[]; resolvedSkillIds: string[] }> {
    return this.bootstrapSkillCatalog.ensureCompanyCatalogThenBindToAgent(companyId, agentId, role);
  }

  /** 商城主管推荐交付 Skill + 管理 Skill（与 executor 路径对齐，幂等 bind）。 */
  private mergeDirectorMarketplaceSkillNames(headMa: MarketplaceAgent): string[] {
    const raw = (headMa as { recommendedSkills?: unknown }).recommendedSkills;
    const existing = Array.isArray(raw) ? raw.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
    return mergeDepartmentHeadRecommendedSkills(existing);
  }

  private async bindDirectorManagementStructure(
    companyId: string,
    ceoAgentId: string | null,
    directorAgents: Array<{ nodeId: string; department: string; agentId: string }>,
  ): Promise<void> {
    if (!directorAgents.length) return;
    const managementSkills = await this.platformSettings.getEffectiveRoleDefaultGlobalSkillNames('director');
    for (const item of directorAgents) {
      await this.nodesRepo.update(
        { id: item.nodeId, companyId },
        {
          metadata: {
            managementStructure: {
              reportsToAgentId: ceoAgentId,
              relationshipType: 'direct',
              department: item.department,
              managementSkills,
              boundAt: new Date().toISOString(),
            },
          },
        } as any,
      );
    }
  }

  private async setupDirectorHierarchy(
    companyId: string,
    ceoAgentId: string | null,
    directorAgents: Array<{ nodeId: string; department: string; agentId: string }>,
  ): Promise<void> {
    if (typeof (this.agentsRepo as any).update !== 'function') return;
    const hierarchyVersion = Math.floor(Date.now() / 1000);
    for (const director of directorAgents) {
      await this.updateReportsToWithAudit({
        companyId,
        agentId: director.agentId,
        reportsToAgentId: ceoAgentId,
        hierarchyVersion,
        reason: 'bootstrap_director_to_ceo',
      });
      const members = await this.nodesRepo.find({
        where: { companyId, parentId: director.nodeId, type: 'agent' },
      });
      const memberAgentIds = members
        .map((x) => x.agentId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      for (const memberAgentId of memberAgentIds) {
        await this.updateReportsToWithAudit({
          companyId,
          agentId: memberAgentId,
          reportsToAgentId: director.agentId,
          hierarchyVersion,
          reason: 'bootstrap_member_to_director',
        });
      }
    }
  }

  private async updateReportsToWithAudit(params: {
    companyId: string;
    agentId: string;
    reportsToAgentId: string | null;
    hierarchyVersion: number;
    reason: string;
  }): Promise<void> {
    const agent = await this.agentsRepo.findOne({
      where: { id: params.agentId, companyId: params.companyId },
    });
    if (!agent) return;
    if (params.reportsToAgentId === params.agentId) {
      this.logger.warn('skip invalid reportsTo self reference', params);
      return;
    }
    if (params.reportsToAgentId) {
      const conflict = await this.detectHierarchyConflict(
        params.companyId,
        params.agentId,
        params.reportsToAgentId,
      );
      if (conflict) {
        this.logger.warn('skip reportsTo update due to hierarchy conflict', params);
        return;
      }
    }
    const before = {
      reportsToAgentId: agent.reportsToAgentId,
      hierarchyVersion: agent.hierarchyVersion,
    };
    await this.agentsRepo.update(
      { id: params.agentId, companyId: params.companyId },
      { reportsToAgentId: params.reportsToAgentId, hierarchyVersion: params.hierarchyVersion },
    );
    await this.auditRepo.save(
      this.auditRepo.create({
        companyId: params.companyId,
        userId: null,
        agentId: params.agentId,
        action: 'update',
        beforeState: before,
        afterState: {
          reportsToAgentId: params.reportsToAgentId,
          hierarchyVersion: params.hierarchyVersion,
          reason: params.reason,
        },
      }),
    );
  }

  private async detectHierarchyConflict(
    companyId: string,
    agentId: string,
    reportsToAgentId: string,
  ): Promise<boolean> {
    let cursor = reportsToAgentId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === agentId) return true;
      if (visited.has(cursor)) return true;
      visited.add(cursor);
      const supervisor = await this.agentsRepo.findOne({
        where: { id: cursor, companyId },
        select: ['id', 'reportsToAgentId'],
      } as any);
      if (!supervisor?.reportsToAgentId) break;
      cursor = supervisor.reportsToAgentId;
    }
    return false;
  }

  private async listTenantNodes(
    companyId: string,
    type: 'ceo' | 'department',
  ): Promise<OrganizationNode[]> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      try {
        if (type === 'department') {
          return await manager.getRepository(OrganizationNode).find({
            where: { companyId, type },
            order: { order: 'ASC' },
          } as any);
        }
        return await manager.getRepository(OrganizationNode).find({
          where: { companyId, type },
        } as any);
      } catch {
        // Unit tests may stub manager.getRepository narrowly; keep behavior compatible.
        if (type === 'department') {
          return await this.nodesRepo.find({
            where: { companyId, type },
            order: { order: 'ASC' },
          } as any);
        }
        return await this.nodesRepo.find({
          where: { companyId, type },
        } as any);
      }
    });
  }

  async ensureDefaultAgentsForCompany(
    companyId: string,
    placements?: DepartmentPlacementDto[],
  ): Promise<void> {
    const platformFallbackModel = await this.platformSettings.getFallbackModel();
    let ceoAgentId: string | null = null;
    const ceoNodes = await this.listTenantNodes(companyId, 'ceo');
    if (!ceoNodes.length) {
      this.logger.warn('Skip default agents bootstrap: no CEO node found under tenant context', {
        companyId,
      });
    }
    for (const node of ceoNodes) {
      const ceoCfg = await this.resolveMarketplaceCeoBootstrap(companyId);
      const assignedKey = ceoCfg.chatKeyId
        ? await this.llmKeysRepo.findOne({ where: { id: ceoCfg.chatKeyId, isActive: true } as any })
        : null;

      if (node.agentId) {
        const existing = await this.runInTenantTx(companyId, async (manager) =>
          manager.getRepository(Agent).findOne({
            where: { id: node.agentId!, companyId, role: 'ceo' } as any,
          }),
        );
        if (existing) {
          ceoAgentId = existing.id;
        }
        if (existing && !existing.llmKeyId && assignedKey) {
          existing.llmKeyId = assignedKey.id;
          existing.llmModel = assignedKey.modelName;
          existing.metadata = {
            ...(existing.metadata ?? {}),
            keyAssignedFrom: 'marketplace_bindings',
            marketplaceAgentId: ceoCfg.templateId ?? undefined,
          };
          await this.runInTenantTx(companyId, async (manager) => {
            await manager.getRepository(Agent).save(existing);
          });
          this.logger.log('Backfilled CEO llm key', {
            companyId,
            agentId: existing.id,
            llmKeyId: assignedKey.id,
            llmModel: assignedKey.modelName,
          });
        }
        const currentPerms = Array.isArray((existing?.metadata as any)?.memoryPermissions)
          ? ((existing?.metadata as any)?.memoryPermissions as unknown[])
              .map((x) => String(x))
              .filter(Boolean)
          : [];
        const mergedPerms = Array.from(new Set([...currentPerms, ...this.ceoMemoryPermissions]));
        if (existing && mergedPerms.length !== currentPerms.length) {
          existing.metadata = {
            ...(existing.metadata ?? {}),
            memoryPermissions: mergedPerms,
          };
          await this.runInTenantTx(companyId, async (manager) => {
            await manager.getRepository(Agent).save(existing);
          });
          this.logger.log('Backfilled CEO memory permissions in metadata', {
            companyId,
            agentId: existing.id,
            permissions: mergedPerms,
          });
        }
      } else {
        const result = await this.dataSource.transaction(async (manager) => {
          await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
          await this.lockBootstrapForCompany(manager, companyId);

          const agentsRepo = manager.getRepository(Agent);
          const nodesRepo = manager.getRepository(OrganizationNode);

          // Another consumer may have already created CEO agent (or node.agentId updated).
          const freshNode = await nodesRepo.findOne({
            where: { id: node.id, companyId },
            select: ['id', 'agentId', 'name', 'companyId'] as any,
          } as any);
          if (freshNode?.agentId) {
            const existingInFresh = await agentsRepo.findOne({
              where: { id: freshNode.agentId, companyId, role: 'ceo' } as any,
            });
            if (existingInFresh) {
              return { agentId: existingInFresh.id, created: false } as const;
            }
          }

          const existingCeo = await agentsRepo.findOne({
            where: { companyId, role: 'ceo' } as any,
            select: ['id', 'llmKeyId'] as any,
          } as any);
          if (existingCeo) {
            await nodesRepo.update({ id: node.id, companyId } as any, { agentId: existingCeo.id } as any);
            return { agentId: existingCeo.id, created: false } as const;
          }

          const agent = (await agentsRepo.save(
            agentsRepo.create({
              companyId,
              organizationNodeId: node.id,
              name: node.name || 'CEO',
              role: 'ceo',
              expertise: '公司最高决策与协调',
              systemPrompt:
                `你是 ${node.name || 'CEO'}，负责公司整体目标拆解与跨部门协调。`,
              llmModel: ceoCfg.chatModel ?? assignedKey?.modelName ?? platformFallbackModel,
              llmKeyId: assignedKey?.id ?? null,
              reportsToAgentId: null,
              hierarchyVersion: 1,
              personality: { style: 'balanced' },
              status: 'active',
              humanInLoop: false,
              metadata: {
                systemGenerated: true,
                keyAssignedFrom: assignedKey ? 'marketplace_bindings' : 'none',
                marketplaceAgentId: ceoCfg.templateId ?? undefined,
                mcpTools: ceoCfg.mcpTools ?? [],
                memoryPermissions: [...this.ceoMemoryPermissions],
              },
            } as any),
          )) as unknown as Agent;

          const res = await nodesRepo.update({ id: node.id, companyId } as any, {
            agentId: agent.id,
          } as any);
          if (!res.affected || res.affected === 0) {
            await agentsRepo.delete({ id: agent.id, companyId } as any);
            const winner = await agentsRepo.findOne({
              where: { companyId, role: 'ceo' } as any,
              select: ['id'] as any,
            } as any);
            return { agentId: winner?.id ?? null, created: false } as const;
          }

          return { agentId: agent.id, created: true, llmKeyId: agent.llmKeyId, llmModel: agent.llmModel } as const;
        });

        let candidateCeoId = result.agentId;
        if (!candidateCeoId) {
          const fb = await this.runInTenantTx(companyId, async (m) =>
            m.getRepository(Agent).findOne({
              where: { companyId, role: 'ceo' } as any,
              select: ['id'] as any,
            } as any),
          );
          candidateCeoId = fb?.id ?? null;
        }

        if (candidateCeoId) {
          if (result.created) {
            this.logger.log('Default CEO agent created', {
              companyId,
              agentId: candidateCeoId,
              llmKeyId: (result as any).llmKeyId,
              llmModel: (result as any).llmModel,
            });
          }
          ceoAgentId = candidateCeoId;
          if (result.created) {
            try {
              await this.agentSkillService.registerMcpToolsForAgent({
                companyId,
                agentId: candidateCeoId,
                tools: ceoCfg.mcpTools ?? [],
              });
            } catch {
              // best-effort: bootstrap should not fail on registry warmup
            }
          }
        }
      }
    }

    await this.atomicInitializeCeoLayers(companyId, ceoNodes.length > 0 ? 'strict' : 'bestEffort');

    const deptNodes = await this.listTenantNodes(companyId, 'department');
    const directorAgents: Array<{ nodeId: string; department: string; agentId: string }> = [];

    for (let i = 0; i < deptNodes.length; i++) {
      const node = deptNodes[i];
      const placement = placements?.[i];
      const nodeMeta = (node.metadata ?? {}) as Record<string, unknown>;
      if (nodeMeta.deferDepartmentAgents === true) {
        continue;
      }
      if (!node.agentId) {
        const headSlug = await this.deptHeadResolver.resolveHeadSlug({
          departmentName: node.name,
          requestedSlug: placement?.headAgentSlug ?? null,
        });
        const headMa = await this.marketplaceAgentsRepo.findOne({
          where: { slug: headSlug, isPublished: true, agentCategory: 'department_head' } as any,
        });
        if (!headMa) {
          throw new Error(`Resolved department head not found or invalid: ${headSlug}`);
        }

        const assignedKey = await this.allocateCompanyMarketplaceKey(companyId, headMa);
        const agent = await this.runInTenantTx(companyId, async (manager) => {
          const agentsRepo = manager.getRepository(Agent);
          const nodesRepo = manager.getRepository(OrganizationNode);
          const created = await agentsRepo.save(
            agentsRepo.create({
              companyId,
              organizationNodeId: node.id,
              name: headMa.name,
              role: 'director',
              expertise: headMa.expertise ?? `${node.name} 部门负责人`,
              systemPrompt:
                headMa.systemPrompt ?? `你是 ${node.name} 部门主管，负责该部门目标与执行协调。`,
              llmModel: assignedKey?.modelName ?? headMa.boundModelName?.trim() ?? platformFallbackModel,
              llmKeyId: assignedKey?.id ?? null,
              reportsToAgentId: ceoAgentId,
              hierarchyVersion: 1,
              personality: { style: 'pragmatic' },
              status: 'active',
              humanInLoop: false,
              metadata: {
                systemGenerated: true,
                marketplaceAgentId: headMa.id,
                keyAssignedFrom: assignedKey ? 'marketplace_bindings' : 'none',
                wizardHeadSlug: headMa.slug,
                mcpTools: Array.isArray((headMa as any).mcpTools) ? ((headMa as any).mcpTools as McpToolDefinition[]) : [],
              },
            }),
          );
          const res = await nodesRepo.update({ id: node.id, companyId } as any, {
            agentId: created.id,
          } as any);
          if (!res.affected || res.affected === 0) {
            await agentsRepo.delete({ id: created.id, companyId } as any);
            return null;
          }
          return created;
        });
        if (agent) {
          this.logger.log('Marketplace director agent created', {
            companyId,
            nodeId: node.id,
            agentId: agent.id,
            slug: headMa.slug,
          });
          directorAgents.push({ nodeId: node.id, department: node.name, agentId: agent.id });
          await this.bindBootstrapSkills(companyId, agent.id, 'director');
          const marketplaceSkillNames = this.mergeDirectorMarketplaceSkillNames(headMa);
          if (marketplaceSkillNames.length) {
            await this.bootstrapSkillCatalog
              .ensureCompanyCatalogThenBindSkillNames(
                companyId,
                agent.id,
                marketplaceSkillNames,
                'bootstrap_director_marketplace',
              )
              .catch((e: unknown) => {
                this.logger.warn('Director marketplace skill bind skipped', {
                  companyId,
                  agentId: agent.id,
                  message: e instanceof Error ? e.message : String(e),
                });
              });
          }
          try {
            await this.agentSkillService.registerMcpToolsForAgent({
              companyId,
              agentId: agent.id,
              tools: Array.isArray((headMa as any).mcpTools) ? ((headMa as any).mcpTools as McpToolDefinition[]) : [],
            });
          } catch {
            // best-effort: bootstrap should not fail on registry warmup
          }
        }
      } else {
        directorAgents.push({ nodeId: node.id, department: node.name, agentId: node.agentId });
        await this.bootstrapSkillCatalog.ensureCompanyCatalogThenBindToAgent(
          companyId,
          node.agentId,
          'director',
        ).catch((e: unknown) => {
          this.logger.warn('Director skill rebind skipped (existing node)', {
            companyId,
            agentId: node.agentId,
            message: e instanceof Error ? e.message : String(e),
          });
        });
      }

      const memberSlugs = placement?.memberAgentSlugs ?? [];
      let childOrder = 0;
      for (const raw of memberSlugs) {
        const slug = raw?.trim();
        if (!slug) {
          continue;
        }
        const memMa = await this.marketplaceAgentsRepo.findOne({
          where: { slug, isPublished: true },
        });
        if (!memMa) {
          continue;
        }

        const assignedKey = await this.allocateCompanyMarketplaceKey(companyId, memMa);
        const created = await this.runInTenantTx(companyId, async (manager) => {
          const nodesRepo = manager.getRepository(OrganizationNode);
          const agentsRepo = manager.getRepository(Agent);
          const child = await nodesRepo.save(
            nodesRepo.create({
              companyId,
              parentId: node.id,
              type: 'agent',
              name: memMa.name,
              description: null,
              order: childOrder,
              metadata: { systemGenerated: true, wizardMemberSlug: memMa.slug },
            }),
          );
          const execAgent = await agentsRepo.save(
            agentsRepo.create({
              companyId,
              organizationNodeId: child.id,
              name: memMa.name,
              role: 'executor',
              expertise: memMa.expertise ?? `${node.name} 执行岗`,
              systemPrompt:
                memMa.systemPrompt ??
                `你是 ${memMa.name}，在 ${node.name} 部门执行具体任务。`,
              llmModel: assignedKey?.modelName ?? memMa.boundModelName?.trim() ?? platformFallbackModel,
              llmKeyId: assignedKey?.id ?? null,
              reportsToAgentId: directorAgents.find((x) => x.nodeId === node.id)?.agentId ?? null,
              hierarchyVersion: 1,
              personality: { style: 'pragmatic' },
              status: 'active',
              humanInLoop: false,
              metadata: {
                systemGenerated: true,
                marketplaceAgentId: memMa.id,
                keyAssignedFrom: assignedKey ? 'marketplace_bindings' : 'none',
                wizardMemberSlug: memMa.slug,
              },
            }),
          );
          const res = await nodesRepo.update({ id: child.id, companyId } as any, {
            agentId: execAgent.id,
          } as any);
          if (!res.affected || res.affected === 0) {
            await agentsRepo.delete({ id: execAgent.id, companyId } as any);
            await nodesRepo.delete({ id: child.id, companyId } as any);
            return null;
          }
          return { childId: child.id, agentId: execAgent.id };
        });
        childOrder += 1;
        if (!created) {
          continue;
        }

        this.logger.log('Wizard member executor created', {
          companyId,
          departmentId: node.id,
          childNodeId: created.childId,
          agentId: created.agentId,
          slug: memMa.slug,
        });
        const deptToken =
          String(
            placement?.platformDepartmentSlug ??
              (node.metadata as Record<string, unknown> | undefined)?.platformDepartmentSlug ??
              '',
          ).trim() || undefined;
        const skillNames = mergeEmployeeBootstrapSkillNames({
          departmentToken: deptToken,
          marketplaceRecommended: Array.isArray(memMa.recommendedSkills)
            ? (memMa.recommendedSkills as string[])
            : null,
        });
        await this.bootstrapSkillCatalog
          .ensureCompanyCatalogThenBindSkillNames(
            companyId,
            created.agentId,
            skillNames,
            'bootstrap_executor_dept',
          )
          .catch((e: unknown) => {
            this.logger.warn('Executor department skill bind skipped', {
              companyId,
              agentId: created.agentId,
              message: e instanceof Error ? e.message : String(e),
            });
          });
      }
    }
    await this.bindDirectorManagementStructure(companyId, ceoAgentId, directorAgents);
    await this.setupDirectorHierarchy(companyId, ceoAgentId, directorAgents);
  }

  async ensureCeoKeyAssignmentForCompany(companyId: string): Promise<void> {
    const template =
      (await this.marketplaceAgentsRepo.findOne({
        where: { slug: this.ceoMarketplaceSlug, isPublished: true } as any,
      })) ??
      (await this.marketplaceAgentsRepo.findOne({
        where: { slug: this.ceoMarketplaceSlug } as any,
      }));
    if (!template) return;
    await this.allocateCompanyMarketplaceKey(companyId, template);
  }
}
