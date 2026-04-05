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

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  private readonly CACHE_TTL = 300;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(AgentAuditLog)
    private readonly auditRepo: Repository<AgentAuditLog>,
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    private readonly tenantContext: TenantContextService,
    private readonly cacheService: CacheService,
    private readonly messagingService: MessagingService,
    private readonly validator: AgentValidatorService,
    private readonly agentSkillService: AgentSkillService,
  ) {}

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
  ): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({
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

  async create(dto: CreateAgentDto, actor: Actor): Promise<Agent> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);
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
          personality: dto.personality ?? null,
          status: 'active',
          humanInLoop: dto.humanInLoop ?? false,
          pendingConfig: null,
          metadata: dto.metadata ?? null,
        }),
      );
      await nodes.update({ id: node.id, companyId }, { agentId: saved.id });
      await this.recordAudit(
        companyId,
        saved.id,
        'create',
        null,
        this.toSerializableAgent(saved) as Record<string, unknown>,
        actor.id,
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

  async update(id: string, dto: UpdateAgentDto, actor: Actor): Promise<Agent | { status: string; pendingConfig: Record<string, unknown> }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);
    const agent = await this.findOne(id);
    const before = this.toSerializableAgent(agent) as Record<string, unknown>;

    const sensitiveKeys: (keyof UpdateAgentDto)[] = ['systemPrompt', 'llmModel', 'personality'];
    const touchesSensitive = sensitiveKeys.some(
      (k) => dto[k] !== undefined && JSON.stringify(dto[k]) !== JSON.stringify((agent as any)[k]),
    );

    if (agent.humanInLoop && touchesSensitive) {
      const pending = { ...(agent.pendingConfig || {}), ...dto };
      agent.pendingConfig = pending as Record<string, unknown>;
      await this.agentsRepo.save(agent);
      await this.clearAgentCache(companyId, id);
      await this.recordAudit(companyId, id, 'update', before, { pendingConfig: pending }, actor.id);
      const pendingFields = sensitiveKeys.filter((k) => dto[k] !== undefined) as string[];
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
      ...('name' in dto && dto.name !== undefined ? { name: dto.name } : {}),
      ...('role' in dto && dto.role !== undefined ? { role: dto.role } : {}),
      ...('expertise' in dto && dto.expertise !== undefined ? { expertise: dto.expertise } : {}),
      ...('avatarUrl' in dto && dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      ...('systemPrompt' in dto && dto.systemPrompt !== undefined ? { systemPrompt: dto.systemPrompt } : {}),
      ...('llmModel' in dto && dto.llmModel !== undefined ? { llmModel: dto.llmModel } : {}),
      ...('llmKeyId' in dto && dto.llmKeyId !== undefined ? { llmKeyId: dto.llmKeyId } : {}),
      ...('personality' in dto && dto.personality !== undefined ? { personality: dto.personality } : {}),
      ...('humanInLoop' in dto && dto.humanInLoop !== undefined ? { humanInLoop: dto.humanInLoop } : {}),
      ...('metadata' in dto && dto.metadata !== undefined ? { metadata: dto.metadata } : {}),
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
      await manager.getRepository(OrganizationNode).update(
        { id: target.id, companyId },
        { agentId: id },
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
