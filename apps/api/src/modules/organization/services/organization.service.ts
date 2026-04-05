import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import type {
  OrganizationNodeCreatedEvent,
  OrganizationNodeDeletedEvent,
  OrganizationNodeMovedEvent,
  OrganizationNodeUpdatedEvent,
  OrganizationStructureChangedEvent,
} from '@contracts/events';
import { getOrgTreeVersionCacheKey } from '../../../common/organization/org-tree-cache-keys.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CreateOrganizationNodeDto } from '../dto/create-organization-node.dto.js';
import { MoveNodeDto } from '../dto/move-node.dto.js';
import { QueryOrganizationTreeDto } from '../dto/query-organization-tree.dto.js';
import { OrganizationTreeNodeDto } from '../dto/organization-tree.dto.js';
import { UpdateNodeDto } from '../dto/update-node.dto.js';
import { OrganizationNode } from '../entities/organization-node.entity.js';
import { OrganizationAuditLog } from '../entities/organization-audit-log.entity.js';
import { OrganizationTreeService } from './organization-tree.service.js';
import { QueryOrganizationAuditLogsDto } from '../dto/query-audit-logs.dto.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);
  private readonly CACHE_TTL = 300;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    @InjectRepository(OrganizationAuditLog)
    private readonly auditRepo: Repository<OrganizationAuditLog>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    private readonly tenantContext: TenantContextService,
    private readonly cacheService: CacheService,
    private readonly messagingService: MessagingService,
    private readonly treeService: OrganizationTreeService,
    @Optional()
    @Inject(forwardRef(() => CollaborationRealtimePublisher))
    private readonly collabRealtime?: CollaborationRealtimePublisher,
  ) {}

  async findNodeByIdForTenant(nodeId: string): Promise<OrganizationNode> {
    const companyId = this.getCompanyIdOrThrow();
    return this.assertNodeExists(nodeId, companyId, '节点不存在');
  }

  async getTree(query: QueryOrganizationTreeDto): Promise<OrganizationTreeNodeDto[]> {
    const companyId = this.getCompanyIdOrThrow();
    const version = await this.getTreeCacheVersion(companyId);
    const cacheKey = this.buildTreeCacheKey(companyId, query, version);
    const cached = await this.cacheService.get<OrganizationTreeNodeDto[]>(cacheKey);
    if (cached) return cached;

    const qb = this.nodesRepo
      .createQueryBuilder('node')
      .where('node.company_id = :companyId', { companyId })
      .orderBy('node.order_no', 'ASC');

    if (query.search) {
      qb.andWhere('node.name ILIKE :search', { search: `%${query.search}%` });
    }
    if (query.type) {
      qb.andWhere('node.type = :type', { type: query.type });
    }

    const nodes = await qb.getMany();
    const tree = this.treeService.buildTree(nodes);
    await this.cacheService.set(cacheKey, tree, this.CACHE_TTL);
    return tree;
  }

  async createNode(dto: CreateOrganizationNodeDto, actor?: Actor): Promise<OrganizationNode> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManageStructure(companyId, actor);

    if (dto.parentId) {
      await this.assertNodeExists(dto.parentId, companyId, '父节点不存在');
    }

    const node = this.nodesRepo.create({
      companyId,
      parentId: dto.parentId ?? null,
      type: dto.type,
      name: dto.name,
      description: dto.description ?? null,
      agentId: dto.agentId ?? null,
      order: dto.order ?? 0,
      metadata: dto.metadata ?? null,
    });
    const saved = await this.nodesRepo.save(node);
    await this.clearTreeCache(companyId);
    await this.recordAudit(companyId, saved.id, 'create', null, saved, actor?.id);
    await this.publishNodeCreated(saved);
    return saved;
  }

  async updateNode(id: string, dto: UpdateNodeDto, actor?: Actor): Promise<OrganizationNode> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManageStructure(companyId, actor);
    const node = await this.assertNodeExists(id, companyId, '节点不存在');

    if (dto.parentId && dto.parentId !== node.parentId) {
      await this.assertNodeExists(dto.parentId, companyId, '父节点不存在');
      await this.assertNoCycle(id, dto.parentId, companyId);
    }

    const before = this.toSerializableNode(node);
    Object.assign(node, {
      parentId: dto.parentId ?? node.parentId,
      type: dto.type ?? node.type,
      name: dto.name ?? node.name,
      description: dto.description ?? node.description,
      agentId: dto.agentId ?? node.agentId,
      order: dto.order ?? node.order,
      metadata: dto.metadata ?? node.metadata,
    });

    const updated = await this.nodesRepo.save(node);
    await this.clearTreeCache(companyId);
    await this.recordAudit(companyId, updated.id, 'update', before, updated, actor?.id);
    await this.publishNodeUpdated(updated);
    return updated;
  }

  async moveNode(id: string, dto: MoveNodeDto, actor?: Actor): Promise<OrganizationNode> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManageStructure(companyId, actor);
    let moved: OrganizationNode;
    try {
      moved = await this.dataSource.transaction(async (manager) => {
        const node = await manager
          .createQueryBuilder(OrganizationNode, 'node')
          .setLock('pessimistic_write')
          .where('node.id = :id AND node.company_id = :companyId', { id, companyId })
          .getOne();
        if (!node) {
          throw new NotFoundException({
            code: ErrorCode.RECORD_NOT_FOUND,
            message: '节点不存在',
          });
        }
        const before = this.toSerializableNode(node);
        if (dto.newParentId) {
          const parent = await manager
            .createQueryBuilder(OrganizationNode, 'node')
            .setLock('pessimistic_write')
            .where('node.id = :id AND node.company_id = :companyId', {
              id: dto.newParentId,
              companyId,
            })
            .getOne();
          if (!parent) {
            throw new NotFoundException({
              code: ErrorCode.RECORD_NOT_FOUND,
              message: '父节点不存在',
            });
          }
          await this.assertNoCycleWithManager(
            manager.getRepository(OrganizationNode),
            id,
            dto.newParentId,
            companyId,
          );
        }
        node.parentId = dto.newParentId ?? null;
        node.order = dto.newOrder;
        const saved = await manager.save(node);
        await manager.save(
          this.auditRepo.create({
            companyId,
            userId: actor?.id ?? null,
            nodeId: saved.id,
            action: 'move',
            beforeState: before,
            afterState: this.toSerializableNode(saved),
          }),
        );
        return saved;
      });
    } catch (error: any) {
      if (error?.code === '40P01' || error?.code === '55P03') {
        throw new ConflictException({
          code: ErrorCode.RESOURCE_CONFLICT,
          message: '组织结构正在被其他操作修改，请重试',
        });
      }
      throw error;
    }
    await this.clearTreeCache(companyId);
    await this.publishNodeMoved(moved);
    await this.publishStructureChanged(companyId, 'move');
    return moved;
  }

  async removeNode(id: string, actor?: Actor): Promise<{ success: true }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManageStructure(companyId, actor);
    const node = await this.assertNodeExists(id, companyId, '节点不存在');

    const childrenCount = await this.nodesRepo.count({
      where: { companyId, parentId: node.id },
    });
    if (childrenCount > 0) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '当前节点包含下级节点，无法直接删除',
      });
    }

    const before = this.toSerializableNode(node);
    await this.nodesRepo.remove(node);
    await this.clearTreeCache(companyId);
    await this.recordAudit(companyId, id, 'delete', before, null, actor?.id);
    await this.publishNodeDeleted(node);
    await this.publishStructureChanged(companyId, 'delete');
    return { success: true };
  }

  /**
   * 解析某组织节点上的 Agent 绑定（用于协作「拉部门」等）。
   * - node_only：仅该节点自身绑定的 Agent（如部门主管）
   * - subtree：该节点及递归子树中所有带 agent_id 的节点
   */
  async findAgentBindingsForNode(
    nodeId: string,
    scope: 'subtree' | 'node_only',
  ): Promise<Array<{ nodeId: string; nodeName: string; agentId: string }>> {
    const companyId = this.getCompanyIdOrThrow();
    const anchor = await this.assertNodeExists(nodeId, companyId, '组织节点不存在');
    if (scope === 'node_only') {
      if (!anchor.agentId) {
        return [];
      }
      return [
        {
          nodeId: anchor.id,
          nodeName: anchor.name,
          agentId: anchor.agentId,
        },
      ];
    }
    const rows = (await this.findDescendantAgents(nodeId, true)) as Record<
      string,
      unknown
    >[];
    const seen = new Set<string>();
    const out: Array<{ nodeId: string; nodeName: string; agentId: string }> =
      [];
    for (const raw of rows) {
      const aid = (raw.agent_id ?? raw.agentId) as string | undefined;
      const id = raw.id as string;
      const name = String(raw.name ?? '');
      if (!aid || seen.has(aid)) continue;
      seen.add(aid);
      out.push({ nodeId: id, nodeName: name, agentId: aid });
    }
    return out;
  }

  async findDescendantAgents(nodeId: string, includeSelf = true): Promise<OrganizationNode[]> {
    const companyId = this.getCompanyIdOrThrow();
    const params = [nodeId, companyId];
    const selfClause = includeSelf ? '' : 'AND n.id <> $1';
    return this.nodesRepo.query(
      `
      WITH RECURSIVE subtree AS (
        SELECT id, parent_id
        FROM organization_nodes
        WHERE id = $1 AND company_id = $2
        UNION ALL
        SELECT n.id, n.parent_id
        FROM organization_nodes n
        JOIN subtree s ON n.parent_id = s.id
        WHERE n.company_id = $2
      )
      SELECT n.*
      FROM organization_nodes n
      JOIN subtree s ON s.id = n.id
      WHERE n.company_id = $2
        AND n.agent_id IS NOT NULL
        ${selfClause}
      ORDER BY n.order_no ASC
      `,
      params,
    );
  }

  async getReportingChain(nodeId: string): Promise<OrganizationNode[]> {
    const companyId = this.getCompanyIdOrThrow();
    return this.nodesRepo.query(
      `
      WITH RECURSIVE chain AS (
        SELECT id, company_id, parent_id, type, name, description, agent_id, order_no, metadata, created_at, updated_at, 0 depth
        FROM organization_nodes
        WHERE id = $1 AND company_id = $2
        UNION ALL
        SELECT n.id, n.company_id, n.parent_id, n.type, n.name, n.description, n.agent_id, n.order_no, n.metadata, n.created_at, n.updated_at, c.depth + 1
        FROM organization_nodes n
        JOIN chain c ON c.parent_id = n.id
        WHERE n.company_id = $2
      )
      SELECT id,
             company_id as "companyId",
             parent_id as "parentId",
             type,
             name,
             description,
             agent_id as "agentId",
             order_no as "order",
             metadata,
             created_at as "createdAt",
             updated_at as "updatedAt"
      FROM chain
      ORDER BY depth ASC
      `,
      [nodeId, companyId],
    );
  }

  async queryAuditLogs(query: QueryOrganizationAuditLogsDto) {
    const companyId = this.getCompanyIdOrThrow();
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.auditRepo
      .createQueryBuilder('log')
      .where('log.company_id = :companyId', { companyId })
      .orderBy('log.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.nodeId) qb.andWhere('log.node_id = :nodeId', { nodeId: query.nodeId });
    if (query.action) qb.andWhere('log.action = :action', { action: query.action });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
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

  private async assertNodeExists(
    id: string,
    companyId: string,
    message: string,
  ): Promise<OrganizationNode> {
    const node = await this.nodesRepo.findOne({ where: { id, companyId } });
    if (!node) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message,
      });
    }
    return node;
  }

  private async assertNoCycle(nodeId: string, newParentId: string, companyId: string): Promise<void> {
    await this.assertNoCycleWithManager(this.nodesRepo, nodeId, newParentId, companyId);
  }

  private async assertCanManageStructure(companyId: string, actor?: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可执行此操作',
      });
    }
    if (actor.roles?.includes('admin')) {
      return;
    }
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可执行此操作',
      });
    }
  }

  private async assertNoCycleWithManager(
    repo: Repository<OrganizationNode>,
    nodeId: string,
    newParentId: string,
    companyId: string,
  ): Promise<void> {
    if (nodeId === newParentId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '节点不能挂载到自己下面',
      });
    }

    let cursor: OrganizationNode | null = await repo.findOne({
      where: { id: newParentId, companyId },
    });
    while (cursor?.parentId) {
      if (cursor.parentId === nodeId) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '不允许形成循环汇报线',
        });
      }
      cursor = await repo.findOne({
        where: { id: cursor.parentId, companyId },
      });
    }
  }

  private async recordAudit(
    companyId: string,
    nodeId: string,
    action: OrganizationAuditLog['action'],
    beforeState: Record<string, any> | null,
    afterState: OrganizationNode | null,
    actorId?: string,
  ): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({
        companyId,
        userId: actorId ?? null,
        nodeId,
        action,
        beforeState,
        afterState: afterState ? this.toSerializableNode(afterState) : null,
      }),
    );
  }

  private toSerializableNode(node: OrganizationNode): Record<string, any> {
    return {
      id: node.id,
      companyId: node.companyId,
      parentId: node.parentId,
      type: node.type,
      name: node.name,
      description: node.description,
      agentId: node.agentId,
      order: node.order,
      metadata: node.metadata,
    };
  }

  private async clearTreeCache(companyId: string): Promise<void> {
    const versionKey = this.getTreeCacheVersionKey(companyId);
    const existed = await this.cacheService.exists(versionKey);
    if (!existed) {
      await this.cacheService.set(versionKey, 2, this.CACHE_TTL * 24);
      return;
    }
    await this.cacheService.increment(versionKey, 1);
    await this.cacheService.expire(versionKey, this.CACHE_TTL * 24);
  }

  private buildTreeCacheKey(
    companyId: string,
    query: QueryOrganizationTreeDto,
    version: number,
  ): string {
    const normalized = {
      search: query?.search || '',
      type: query?.type || '',
    };
    return `company:${companyId}:org-tree:v${version}:${JSON.stringify(normalized)}`;
  }

  private getTreeCacheVersionKey(companyId: string): string {
    return getOrgTreeVersionCacheKey(companyId);
  }

  private async getTreeCacheVersion(companyId: string): Promise<number> {
    const versionKey = this.getTreeCacheVersionKey(companyId);
    const cachedVersion = await this.cacheService.get<number>(versionKey);
    if (typeof cachedVersion === 'number' && Number.isFinite(cachedVersion)) {
      return cachedVersion;
    }
    await this.cacheService.set(versionKey, 1, this.CACHE_TTL * 24);
    return 1;
  }

  private async publishNodeCreated(node: OrganizationNode): Promise<void> {
    const event: OrganizationNodeCreatedEvent = {
      eventId: randomUUID(),
      eventType: 'organization.node.created',
      aggregateId: node.id,
      aggregateType: 'organization_node',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: node.companyId,
      data: {
        companyId: node.companyId,
        nodeId: node.id,
        parentId: node.parentId || undefined,
        type: node.type,
        name: node.name,
        agentId: node.agentId || undefined,
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
  }

  private async publishNodeUpdated(node: OrganizationNode): Promise<void> {
    const event: OrganizationNodeUpdatedEvent = {
      eventId: randomUUID(),
      eventType: 'organization.node.updated',
      aggregateId: node.id,
      aggregateType: 'organization_node',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: node.companyId,
      data: {
        companyId: node.companyId,
        nodeId: node.id,
        parentId: node.parentId || undefined,
        type: node.type,
        name: node.name,
        agentId: node.agentId || undefined,
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
  }

  private async publishNodeMoved(node: OrganizationNode): Promise<void> {
    const event: OrganizationNodeMovedEvent = {
      eventId: randomUUID(),
      eventType: 'organization.node.moved',
      aggregateId: node.id,
      aggregateType: 'organization_node',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: node.companyId,
      data: {
        companyId: node.companyId,
        nodeId: node.id,
        newParentId: node.parentId || undefined,
        newOrder: node.order,
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
  }

  private async publishNodeDeleted(node: OrganizationNode): Promise<void> {
    const event: OrganizationNodeDeletedEvent = {
      eventId: randomUUID(),
      eventType: 'organization.node.deleted',
      aggregateId: node.id,
      aggregateType: 'organization_node',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: node.companyId,
      data: {
        companyId: node.companyId,
        nodeId: node.id,
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
  }

  private async publishStructureChanged(companyId: string, reason: string): Promise<void> {
    try {
      const event: OrganizationStructureChangedEvent = {
        eventId: randomUUID(),
        eventType: 'organization.structure.changed',
        aggregateId: companyId,
        aggregateType: 'organization',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          companyId,
          reason,
        },
      };
      await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
      await this.collabRealtime?.publishEnvelope({
        companyId,
        event: 'org:structure_changed',
        payload: { reason, occurredAt: new Date().toISOString() },
      });
    } catch (error: any) {
      this.logger.error('Failed to publish organization.structure.changed', {
        companyId,
        reason,
        error: error?.message,
      });
    }
  }
}
