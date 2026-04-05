import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { getDefaultGlobalSkillNamesForRole } from '../../skills/default-skills.js';
import { SkillsService } from '../../skills/services/skills.service.js';
import type { DepartmentPlacementDto } from '../../companies/dto/department-placement.dto.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import { MarketplaceAgentKeyBinding } from '../../templates/entities/marketplace-agent-key-binding.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { Agent } from '../entities/agent.entity.js';
import { AgentSkillService } from './agent-skill.service.js';
import { SQL_SET_LOCAL_CURRENT_TENANT } from '@service/tenant';

/**
 * 公司组织初始化后创建默认 CEO / 部门主管 / 向导成员 Agent（幂等）。
 */
@Injectable()
export class AgentsBootstrapService {
  private readonly logger = new Logger(AgentsBootstrapService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
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
  ) {}

  private async resolveCeoMarketplaceAgent(): Promise<MarketplaceAgent | null> {
    const a = await this.marketplaceAgentsRepo.findOne({ where: { slug: 'ceo', isPublished: true } });
    return a ?? null;
  }

  /**
   * 为指定上架商城 Agent 分配公司级 LLM Key（RLS 需在事务内 set tenant）。
   */
  async allocateCompanyMarketplaceKey(
    companyId: string,
    marketplaceAgent: MarketplaceAgent,
  ): Promise<LlmKey | null> {
    return await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);

      const assignments = manager.getRepository(CompanyMarketplaceAgentKeyAssignment);
      const llmKeys = manager.getRepository(LlmKey);
      const bindings = await manager
        .getRepository(MarketplaceAgentKeyBinding)
        .find({
          where: { marketplaceAgentId: marketplaceAgent.id },
          order: { sortOrder: 'ASC' },
        });

      if (!bindings.length) {
        return null;
      }

      const existing = await assignments.findOne({
        where: { companyId, marketplaceAgentId: marketplaceAgent.id },
      });
      if (existing) {
        const key = await llmKeys.findOne({ where: { id: existing.assignedLlmKeyId } });
        return key ?? null;
      }

      const candidateIds = bindings.map((b) => b.llmKeyId);
      const keys = await llmKeys.find({ where: { id: In(candidateIds) } as any });
      const keyMap = new Map(keys.map((k) => [k.id, k] as const));

      const boundModelName = marketplaceAgent.boundModelName?.trim() || null;
      const orderedCandidates = bindings
        .map((b) => keyMap.get(b.llmKeyId))
        .filter((k): k is LlmKey => !!k)
        .filter((k) => k.isActive)
        .filter((k) => (boundModelName ? k.modelName === boundModelName : true));

      if (!orderedCandidates.length) {
        return null;
      }

      for (const k of orderedCandidates) {
        try {
          await assignments.save(
            assignments.create({
              companyId,
              marketplaceAgentId: marketplaceAgent.id,
              assignedLlmKeyId: k.id,
            }),
          );
          const fresh = await llmKeys.findOne({ where: { id: k.id } });
          return fresh ?? k;
        } catch (e: any) {
          if (String(e?.code ?? '') === '23505') {
            continue;
          }
          throw e;
        }
      }
      return null;
    });
  }

  private async bindBootstrapSkills(
    companyId: string,
    agentId: string,
    role: string,
  ): Promise<void> {
    const names = getDefaultGlobalSkillNamesForRole(role);
    const skillIds = await this.skillsService.findGlobalSkillIdsByNames(names);
    await this.agentSkillService.bindDefaultSkillsForAgent(agentId, companyId, skillIds);
  }

  async ensureDefaultAgentsForCompany(
    companyId: string,
    placements?: DepartmentPlacementDto[],
  ): Promise<void> {
    const ceoNodes = await this.nodesRepo.find({
      where: { companyId, type: 'ceo' },
    });
    for (const node of ceoNodes) {
      const ceoMarketplaceAgent = await this.resolveCeoMarketplaceAgent();
      const assignedKey = ceoMarketplaceAgent
        ? await this.allocateCompanyMarketplaceKey(companyId, ceoMarketplaceAgent)
        : null;
      if (node.agentId) {
        const existing = await this.agentsRepo.findOne({
          where: { id: node.agentId, companyId, role: 'ceo' },
        });
        if (existing && !existing.llmKeyId && assignedKey) {
          existing.llmKeyId = assignedKey.id;
          existing.llmModel = assignedKey.modelName;
          existing.metadata = {
            ...(existing.metadata ?? {}),
            marketplaceAgentId: ceoMarketplaceAgent?.id,
            keyAssignedFrom: 'marketplace_bindings',
          };
          await this.agentsRepo.save(existing);
          this.logger.log('Backfilled CEO llm key', {
            companyId,
            agentId: existing.id,
            llmKeyId: assignedKey.id,
            llmModel: assignedKey.modelName,
          });
        }
        continue;
      }
      const agent = await this.agentsRepo.save(
        this.agentsRepo.create({
          companyId,
          organizationNodeId: node.id,
          name: node.name || 'CEO',
          role: 'ceo',
          expertise: ceoMarketplaceAgent?.expertise ?? '公司最高决策与协调',
          systemPrompt:
            ceoMarketplaceAgent?.systemPrompt ??
            `你是 ${node.name || 'CEO'}，负责公司整体目标拆解与跨部门协调。`,
          llmModel: assignedKey?.modelName ?? 'gpt-4o-mini',
          llmKeyId: assignedKey?.id ?? null,
          personality: { style: 'balanced' },
          status: 'active',
          humanInLoop: false,
          metadata: {
            systemGenerated: true,
            marketplaceAgentId: ceoMarketplaceAgent?.id,
            keyAssignedFrom: assignedKey ? 'marketplace_bindings' : 'none',
          },
        }),
      );

      const res = await this.nodesRepo.update({ id: node.id, agentId: null }, { agentId: agent.id });
      if (!res.affected || res.affected === 0) {
        await this.agentsRepo.delete({ id: agent.id, companyId });
        continue;
      }

      this.logger.log('Default CEO agent created', {
        companyId,
        agentId: agent.id,
        llmKeyId: agent.llmKeyId,
        llmModel: agent.llmModel,
      });
      await this.bindBootstrapSkills(companyId, agent.id, 'ceo');
    }

    const deptNodes = await this.nodesRepo.find({
      where: { companyId, type: 'department' },
      order: { order: 'ASC' },
    });

    for (let i = 0; i < deptNodes.length; i++) {
      const node = deptNodes[i];
      const placement = placements?.[i];
      if (!node.agentId) {
        const headSlug = placement?.headAgentSlug?.trim();
        let headMa: MarketplaceAgent | null = null;
        if (headSlug) {
          headMa = await this.marketplaceAgentsRepo.findOne({
            where: { slug: headSlug, isPublished: true },
          });
        }

        if (headMa) {
          const assignedKey = await this.allocateCompanyMarketplaceKey(companyId, headMa);
          const agent = await this.agentsRepo.save(
            this.agentsRepo.create({
              companyId,
              organizationNodeId: node.id,
              name: headMa.name,
              role: 'director',
              expertise: headMa.expertise ?? `${node.name} 部门负责人`,
              systemPrompt:
                headMa.systemPrompt ?? `你是 ${node.name} 部门主管，负责该部门目标与执行协调。`,
              llmModel: assignedKey?.modelName ?? headMa.boundModelName?.trim() ?? 'gpt-4o-mini',
              llmKeyId: assignedKey?.id ?? null,
              personality: { style: 'pragmatic' },
              status: 'active',
              humanInLoop: false,
              metadata: {
                systemGenerated: true,
                marketplaceAgentId: headMa.id,
                keyAssignedFrom: assignedKey ? 'marketplace_bindings' : 'none',
                wizardHeadSlug: headMa.slug,
              },
            }),
          );

          const res = await this.nodesRepo.update({ id: node.id, agentId: null }, { agentId: agent.id });
          if (!res.affected || res.affected === 0) {
            await this.agentsRepo.delete({ id: agent.id, companyId });
          } else {
            this.logger.log('Marketplace director agent created', {
              companyId,
              nodeId: node.id,
              agentId: agent.id,
              slug: headMa.slug,
            });
            await this.bindBootstrapSkills(companyId, agent.id, 'director');
          }
        } else {
          const agent = await this.agentsRepo.save(
            this.agentsRepo.create({
              companyId,
              organizationNodeId: node.id,
              name: `${node.name} Lead`,
              role: 'director',
              expertise: `${node.name} 部门负责人`,
              systemPrompt: `你是 ${node.name} 部门主管，负责该部门目标与执行协调。`,
              llmModel: 'gpt-4o-mini',
              personality: { style: 'pragmatic' },
              status: 'active',
              humanInLoop: false,
              metadata: { systemGenerated: true },
            }),
          );

          const res = await this.nodesRepo.update({ id: node.id, agentId: null }, { agentId: agent.id });
          if (!res.affected || res.affected === 0) {
            await this.agentsRepo.delete({ id: agent.id, companyId });
            continue;
          }

          this.logger.log('Default director agent created', {
            companyId,
            nodeId: node.id,
            agentId: agent.id,
          });
          await this.bindBootstrapSkills(companyId, agent.id, 'director');
        }
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

        const child = await this.nodesRepo.save(
          this.nodesRepo.create({
            companyId,
            parentId: node.id,
            type: 'agent',
            name: memMa.name,
            description: null,
            order: childOrder,
            metadata: { systemGenerated: true, wizardMemberSlug: memMa.slug },
          }),
        );
        childOrder += 1;

        const assignedKey = await this.allocateCompanyMarketplaceKey(companyId, memMa);
        const execAgent = await this.agentsRepo.save(
          this.agentsRepo.create({
            companyId,
            organizationNodeId: child.id,
            name: memMa.name,
            role: 'executor',
            expertise: memMa.expertise ?? `${node.name} 执行岗`,
            systemPrompt:
              memMa.systemPrompt ??
              `你是 ${memMa.name}，在 ${node.name} 部门执行具体任务。`,
            llmModel: assignedKey?.modelName ?? memMa.boundModelName?.trim() ?? 'gpt-4o-mini',
            llmKeyId: assignedKey?.id ?? null,
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

        const res = await this.nodesRepo.update(
          { id: child.id, agentId: null },
          { agentId: execAgent.id },
        );
        if (!res.affected || res.affected === 0) {
          await this.agentsRepo.delete({ id: execAgent.id, companyId });
          await this.nodesRepo.delete({ id: child.id, companyId });
          continue;
        }

        this.logger.log('Wizard member executor created', {
          companyId,
          departmentId: node.id,
          childNodeId: child.id,
          agentId: execAgent.id,
          slug: memMa.slug,
        });
        await this.bindBootstrapSkills(companyId, execAgent.id, 'executor');
      }
    }
  }

  async ensureCeoKeyAssignmentForCompany(companyId: string): Promise<void> {
    const ma = await this.resolveCeoMarketplaceAgent();
    if (ma) {
      await this.allocateCompanyMarketplaceKey(companyId, ma);
    }
  }
}
