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
import { AddDepartmentFromPlatformDto } from '../dto/add-department-from-platform.dto.js';
import { AgentsBootstrapService } from '../../agents/services/agents-bootstrap.service.js';
import { SQL_SET_LOCAL_CURRENT_TENANT } from '@service/tenant';
import { resolveDepartmentCapability } from '@foundry/contracts/types/department-assignment';
import {
  assertResponsibilitySummaryPresent,
  buildDepartmentNodeCapabilityMetadata,
  mergeDepartmentMetadataPatch,
  suggestCapabilitiesFromText,
  type PlatformCapabilitiesRow,
} from '../utils/department-capabilities-metadata.util.js';
import type { SuggestDepartmentCapabilitiesDto } from '../dto/suggest-department-capabilities.dto.js';

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
    private readonly agentsBootstrap: AgentsBootstrapService,
    @Optional()
    @Inject(forwardRef(() => CollaborationRealtimePublisher))
    private readonly collabRealtime?: CollaborationRealtimePublisher,
  ) {}

  async addDepartmentFromPlatform(dto: AddDepartmentFromPlatformDto, actor?: Actor): Promise<OrganizationNode> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManageStructure(companyId, actor);

    const platformSlug = String(dto.platformDepartmentSlug || '').trim();
    if (!platformSlug) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'platformDepartmentSlug 不能为空',
      });
    }

    const created = await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);

      const rows = (await manager.query(
        `
          SELECT
            d.slug,
            d.display_name AS "displayName",
            d.director_marketplace_agent_id AS "directorId",
            ma.slug AS "directorSlug",
            d.responsibility_summary AS "responsibilitySummary",
            d.task_type_tags AS "taskTypeTags",
            d.excludes_task_type_tags AS "excludesTaskTypeTags"
          FROM platform_departments d
          LEFT JOIN marketplace_agents ma ON ma.id = d.director_marketplace_agent_id
          WHERE d.slug = $1
          LIMIT 1
        `,
        [platformSlug],
      )) as Array<{
        slug: string;
        displayName: string;
        directorId: string | null;
        directorSlug: string | null;
        responsibilitySummary: string | null;
        taskTypeTags: string[] | null;
        excludesTaskTypeTags: string[] | null;
      }>;
      const pd = rows?.[0];
      if (!pd?.slug) {
        throw new NotFoundException({
          code: ErrorCode.RECORD_NOT_FOUND,
          message: `平台部门不存在: ${platformSlug}`,
        });
      }

      // Prevent duplicate department by platformDepartmentSlug.
      const dup = await manager.query(
        `
          SELECT 1
          FROM organization_nodes
          WHERE company_id = $1
            AND type = 'department'
            AND (metadata->>'platformDepartmentSlug') = $2
          LIMIT 1
        `,
        [companyId, platformSlug],
      );
      if (Array.isArray(dup) && dup.length > 0) {
        throw new ConflictException({
          code: ErrorCode.RESOURCE_CONFLICT,
          message: `该平台部门已存在于组织中: ${platformSlug}`,
        });
      }

      let parentId = dto.parentId ?? null;
      if (parentId) {
        const parent = await manager.getRepository(OrganizationNode).findOne({ where: { id: parentId, companyId } as any });
        if (!parent) {
          throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: '父节点不存在' });
        }
      } else {
        const ceo = await manager
          .getRepository(OrganizationNode)
          .findOne({ where: { companyId, type: 'ceo' } as any, order: { order: 'ASC' } as any });
        parentId = ceo?.id ?? null;
      }

      const maxOrderRows = await manager.query(
        `
          SELECT COALESCE(MAX(order_no), 0)::int AS max
          FROM organization_nodes
          WHERE company_id = $1 AND type = 'department'
        `,
        [companyId],
      );
      const nextOrder = Number(maxOrderRows?.[0]?.max ?? 0) + 1;

      const headSlug = typeof pd.directorSlug === 'string' ? pd.directorSlug.trim() : '';
      const deferDepartmentAgents = headSlug.length === 0;

      const capabilityMeta = buildDepartmentNodeCapabilityMetadata({
        input: {
          responsibilitySummary: dto.description?.trim() || pd.responsibilitySummary,
          description: dto.description?.trim() || pd.responsibilitySummary,
        },
        platformRow: pd as PlatformCapabilitiesRow,
        capabilitiesSource: 'platform_template',
        platformDepartmentSlug: platformSlug,
      });
      const node = manager.getRepository(OrganizationNode).create({
        companyId,
        parentId,
        type: 'department',
        name: String(pd.displayName || platformSlug).trim(),
        description: String(capabilityMeta.responsibilitySummary ?? pd.responsibilitySummary ?? pd.displayName).trim(),
        agentId: null,
        order: nextOrder,
        metadata: {
          ...capabilityMeta,
          ...(deferDepartmentAgents ? { deferDepartmentAgents: true } : {}),
        },
      });
      const saved = await manager.getRepository(OrganizationNode).save(node);
      return { saved, headSlug };
    });

    // Ensure head binding if available (idempotent bootstrap).
    if (created.headSlug) {
      const deptNodes = await this.dataSource.transaction(async (manager) => {
        await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
        return await manager.getRepository(OrganizationNode).find({
          where: { companyId, type: 'department' } as any,
          order: { order: 'ASC' } as any,
        });
      });
      const placements = deptNodes.map((n) => {
        const slug =
          typeof (n.metadata as any)?.platformDepartmentSlug === 'string'
            ? String((n.metadata as any).platformDepartmentSlug)
            : null;
        // For the newly created department, use resolved director slug.
        const headAgentSlug = n.id === created.saved.id ? created.headSlug : null;
        const defer = Boolean((n.metadata as any)?.deferDepartmentAgents);
        return {
          name: n.name,
          headAgentSlug: defer ? null : headAgentSlug,
          memberAgentSlugs: [] as string[],
          ...(slug ? { platformDepartmentSlug: slug } : {}),
        };
      });
      await this.agentsBootstrap.ensureDefaultAgentsForCompany(companyId, placements as any);
    }

    await this.clearTreeCache(companyId);
    const nodeForEvent =
      (await this.nodesRepo.findOne({ where: { id: created.saved.id, companyId } })) ?? created.saved;
    await this.recordAudit(companyId, nodeForEvent.id, 'create', null, nodeForEvent, actor?.id);
    await this.publishNodeCreated(nodeForEvent);
    return nodeForEvent;
  }

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

    const nodes = await this.loadOrganizationNodesForTenant(companyId, query);
    const tree = this.treeService.buildTree(nodes);
    // 禁止缓存空树：RLS/连接池未设租户时可能误读为空，会污染后续快照。
    if (tree.length > 0) {
      await this.cacheService.set(cacheKey, tree, this.CACHE_TTL);
    }
    return tree;
  }

  /** 向导转正后立即失效，避免读到初始化前的空树缓存。 */
  async invalidateTreeCache(companyId: string): Promise<void> {
    await this.clearTreeCache(companyId);
  }

  private async loadOrganizationNodesForTenant(
    companyId: string,
    query: QueryOrganizationTreeDto,
  ): Promise<OrganizationNode[]> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      const qb = manager
        .getRepository(OrganizationNode)
        .createQueryBuilder('node')
        .where('node.company_id = :companyId', { companyId })
        .orderBy('node.order_no', 'ASC');

      if (query.search) {
        qb.andWhere('node.name ILIKE :search', { search: `%${query.search}%` });
      }
      if (query.type) {
        qb.andWhere('node.type = :type', { type: query.type });
      }

      return qb.getMany();
    });
  }

  /**
   * 2026 群聊 RoomContext：基于 chat_room + 完整组织树生成非空的部门/公司级路由切片（含 CEO/Board）。
   * 组织树无任何可路由节点时抛错，禁止静默空快照。
   */
  async getRoomOrgSnapshot(roomId: string): Promise<{
    roomId: string;
    organizationNodeId: string | null;
    departments: Array<{
      id: string;
      name: string;
      slug: string;
      platformDepartmentSlug?: string | null;
      responsibilitySummary?: string;
      taskTypeTags?: string[];
      excludesTaskTypeTags?: string[];
      capabilitiesSource?: string;
    }>;
    treeVersion: number;
    updatedAt: string;
  }> {
    const companyId = this.getCompanyIdOrThrow();
    const rid = String(roomId ?? '').trim();
    if (!rid) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'roomId 不能为空',
      });
    }

    const row = await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      const rows = (await manager.query(
        `
          SELECT id, organization_node_id AS "organizationNodeId", metadata, name
          FROM chat_rooms
          WHERE id = $1 AND company_id = $2
          LIMIT 1
        `,
        [rid, companyId],
      )) as Array<{
        id: string;
        organizationNodeId: string | null;
        metadata: Record<string, unknown> | null;
        name: string;
      }>;
      return rows?.[0] ?? null;
    });

    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: `聊天室不存在: ${rid}`,
      });
    }

    const treeVersion = await this.getTreeCacheVersion(companyId);
    const tree = await this.getTree({});
    let departments = this.deduplicateOrgUnitSlugs(
      this.flattenRoutableOrgUnits(tree, row.organizationNodeId),
    );
    const enrichedDepartments = await this.enrichOrgSnapshotDepartmentsWithCapabilities(departments);

    if (!enrichedDepartments.length) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'organization_org_snapshot_requires_structure',
      });
    }

    return {
      roomId: row.id,
      organizationNodeId: row.organizationNodeId,
      departments: enrichedDepartments,
      treeVersion,
      updatedAt: new Date().toISOString(),
    };
  }

  private flattenRoutableOrgUnits(
    roots: OrganizationTreeNodeDto[],
    roomOrganizationNodeId: string | null,
  ): Array<{
    id: string;
    name: string;
    slug: string;
    platformDepartmentSlug: string | null;
    metadata: Record<string, unknown> | null;
    description: string | null;
  }> {
    const byId = new Map<
      string,
      {
        id: string;
        name: string;
        slug: string;
        platformDepartmentSlug: string | null;
        metadata: Record<string, unknown> | null;
        description: string | null;
      }
    >();
    const walk = (n: OrganizationTreeNodeDto) => {
      if (n.type === 'department' || n.type === 'board' || n.type === 'ceo') {
        const slug = this.orgUnitSlug(n);
        if (slug) {
          const meta =
            n.metadata && typeof n.metadata === 'object' && !Array.isArray(n.metadata)
              ? (n.metadata as Record<string, unknown>)
              : null;
          const platformDepartmentSlug =
            meta && typeof meta.platformDepartmentSlug === 'string'
              ? String(meta.platformDepartmentSlug).trim() || null
              : null;
          byId.set(n.id, {
            id: n.id,
            name: String(n.name ?? '').trim() || n.id,
            slug,
            platformDepartmentSlug,
            metadata: meta,
            description: n.description ?? null,
          });
        }
      }
      for (const c of n.children ?? []) walk(c);
    };
    for (const r of roots) walk(r);

    let list = [...byId.values()];
    const rid = String(roomOrganizationNodeId ?? '').trim();
    if (rid && byId.has(rid)) {
      const first = byId.get(rid)!;
      list = [first, ...list.filter((x) => x.id !== rid)];
    }
    return list;
  }

  private async loadPlatformCapabilitiesBySlugs(
    slugs: string[],
  ): Promise<Map<string, PlatformCapabilitiesRow>> {
    const unique = [...new Set(slugs.map((s) => String(s).trim()).filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = (await this.dataSource.query(
      `
        SELECT
          slug,
          responsibility_summary AS "responsibilitySummary",
          task_type_tags AS "taskTypeTags",
          excludes_task_type_tags AS "excludesTaskTypeTags"
        FROM platform_departments
        WHERE slug = ANY($1::text[])
      `,
      [unique],
    )) as PlatformCapabilitiesRow[];
    return new Map(rows.map((r) => [r.slug, r]));
  }

  private async enrichOrgSnapshotDepartmentsWithCapabilities(
    items: Array<{
      id: string;
      name: string;
      slug: string;
      platformDepartmentSlug: string | null;
      metadata: Record<string, unknown> | null;
      description: string | null;
    }>,
  ): Promise<
    Array<{
      id: string;
      name: string;
      slug: string;
      platformDepartmentSlug?: string | null;
      responsibilitySummary?: string;
      taskTypeTags?: string[];
      excludesTaskTypeTags?: string[];
      capabilitiesSource?: string;
    }>
  > {
    const lookupSlugs = items.flatMap((d) => {
      const out: string[] = [];
      if (d.platformDepartmentSlug) out.push(d.platformDepartmentSlug);
      out.push(d.slug);
      return out;
    });
    const platformBySlug = await this.loadPlatformCapabilitiesBySlugs(lookupSlugs);

    return items.map((d) => {
      const platformRow =
        (d.platformDepartmentSlug ? platformBySlug.get(d.platformDepartmentSlug) : undefined) ??
        platformBySlug.get(d.slug) ??
        null;
      const cap = resolveDepartmentCapability({
        department: {
          id: d.id,
          name: d.name,
          slug: d.slug,
          platformDepartmentSlug: d.platformDepartmentSlug,
          metadata: d.metadata,
          description: d.description,
        },
        platformRow,
      });
      return {
        id: d.id,
        name: d.name,
        slug: d.slug,
        platformDepartmentSlug: cap.platformDepartmentSlug ?? d.platformDepartmentSlug,
        ...(cap.responsibilitySummary ? { responsibilitySummary: cap.responsibilitySummary } : {}),
        ...(cap.taskTypeTags.length ? { taskTypeTags: cap.taskTypeTags } : {}),
        ...(cap.excludesTaskTypeTags?.length ? { excludesTaskTypeTags: cap.excludesTaskTypeTags } : {}),
        ...(cap.capabilitiesSource ? { capabilitiesSource: cap.capabilitiesSource } : {}),
      };
    });
  }

  private deduplicateOrgUnitSlugs(
    items: Array<{
      id: string;
      name: string;
      slug: string;
      platformDepartmentSlug: string | null;
      metadata: Record<string, unknown> | null;
      description: string | null;
    }>,
  ): Array<{
    id: string;
    name: string;
    slug: string;
    platformDepartmentSlug: string | null;
    metadata: Record<string, unknown> | null;
    description: string | null;
  }> {
    const used = new Set<string>();
    return items.map((item) => {
      let s = item.slug;
      let n = 0;
      while (used.has(s)) {
        n += 1;
        s = `${item.slug}__${n}`;
      }
      used.add(s);
      return { ...item, slug: s };
    });
  }

  private orgUnitSlug(n: OrganizationTreeNodeDto): string {
    const meta =
      n.metadata && typeof n.metadata === 'object' && n.metadata !== null
        ? (n.metadata as Record<string, unknown>)
        : {};
    const platformSlug =
      typeof meta['platformDepartmentSlug'] === 'string' ? String(meta['platformDepartmentSlug']).trim() : '';
    const deptSlug =
      typeof meta['departmentSlug'] === 'string' ? String(meta['departmentSlug']).trim() : '';
    let base = platformSlug || deptSlug || String(n.name ?? '').trim();
    if (!base && n.type === 'ceo') base = 'ceo';
    if (!base && n.type === 'board') base = 'board';
    const slugified = this.slugifyOrgSegment(base);
    if (!slugified) return '';
    if (n.type === 'ceo') return `ceo-${slugified}`;
    if (n.type === 'board') return `board-${slugified}`;
    return slugified;
  }

  private slugifyOrgSegment(source: string): string {
    return source
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-\u4e00-\u9fff]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
  }

  suggestDepartmentCapabilities(dto: SuggestDepartmentCapabilitiesDto): {
    suggestedTaskTypeTags: string[];
    suggestedResponsibilitySummary: string;
  } {
    const draft = String(dto.responsibilitySummary ?? dto.description ?? '').trim();
    return suggestCapabilitiesFromText(dto.name, draft);
  }

  async createNode(dto: CreateOrganizationNodeDto, actor?: Actor): Promise<OrganizationNode> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManageStructure(companyId, actor);

    let mergedMetadata = dto.metadata ?? null;
    let description = dto.description ?? null;

    if (dto.type === 'department') {
      const platformSlug =
        typeof dto.metadata?.platformDepartmentSlug === 'string'
          ? String(dto.metadata.platformDepartmentSlug).trim()
          : '';
      if (platformSlug) {
        const rows = (await this.dataSource.query(
          `
            SELECT
              slug,
              responsibility_summary AS "responsibilitySummary",
              task_type_tags AS "taskTypeTags",
              excludes_task_type_tags AS "excludesTaskTypeTags"
            FROM platform_departments
            WHERE slug = $1
            LIMIT 1
          `,
          [platformSlug],
        )) as PlatformCapabilitiesRow[];
        if (!rows?.[0]) {
          throw new BadRequestException({
            code: ErrorCode.BAD_REQUEST,
            message: `无效的平台部门 slug: ${platformSlug}`,
          });
        }
        const capabilityMeta = buildDepartmentNodeCapabilityMetadata({
          input: {
            responsibilitySummary: dto.responsibilitySummary ?? dto.description,
            description: dto.description,
            taskTypeTags: dto.taskTypeTags,
            excludesTaskTypeTags: dto.excludesTaskTypeTags,
          },
          platformRow: rows[0],
          capabilitiesSource: 'platform_template',
          platformDepartmentSlug: platformSlug,
        });
        mergedMetadata = { ...(dto.metadata ?? {}), ...capabilityMeta };
        description = String(capabilityMeta.responsibilitySummary ?? description ?? '').trim() || null;
      } else {
        const capabilityMeta = buildDepartmentNodeCapabilityMetadata({
          input: {
            responsibilitySummary: dto.responsibilitySummary ?? dto.description,
            description: dto.description,
            taskTypeTags: dto.taskTypeTags,
            excludesTaskTypeTags: dto.excludesTaskTypeTags,
          },
          capabilitiesSource: 'user_defined',
          platformDepartmentSlug: null,
        });
        mergedMetadata = { ...(dto.metadata ?? {}), ...capabilityMeta };
        description = String(capabilityMeta.responsibilitySummary ?? '').trim() || null;
      }
    }

    if (dto.parentId) {
      await this.assertNodeExists(dto.parentId, companyId, '父节点不存在');
    }

    const node = this.nodesRepo.create({
      companyId,
      parentId: dto.parentId ?? null,
      type: dto.type,
      name: dto.name,
      description,
      agentId: dto.agentId ?? null,
      order: dto.order ?? 0,
      metadata: mergedMetadata,
    });
    const saved = await this.nodesRepo.save(node);
    await this.clearTreeCache(companyId);
    await this.recordAudit(companyId, saved.id, 'create', null, saved, actor?.id);
    await this.publishNodeCreated(saved);
    return saved;
  }

  async updateNode(id: string, dto: UpdateNodeDto, actor?: Actor): Promise<OrganizationNode> {
    const companyId = this.getCompanyIdOrThrow();
    const node = await this.assertNodeExists(id, companyId, '节点不存在');

    const actorId = actor?.id ? String(actor.id).trim() : '';
    if (!actorId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '无权限执行此操作',
      });
    }
    const isPrivileged =
      actor?.roles?.includes('admin') ||
      (await (async () => {
        const membership = await this.membershipsRepo.findOne({
          where: { companyId, userId: actorId, isActive: true },
        });
        return Boolean(membership && ['owner', 'admin'].includes(membership.role));
      })());

    // Department head can opt-in/out department-only sharing by toggling whitelisted metadata keys.
    // This is intentionally *narrow*: department head cannot modify structure/name/agent binding/order/etc.
    const allowDeptHeadToggleOnly =
      node.type === 'department' &&
      typeof node.agentId === 'string' &&
      node.agentId.trim() &&
      node.agentId.trim() === actorId;

    if (!isPrivileged && !allowDeptHeadToggleOnly) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 或部门负责人可执行此操作',
      });
    }

    if (!isPrivileged && allowDeptHeadToggleOnly) {
      const structuralTouched =
        dto.parentId !== undefined ||
        dto.type !== undefined ||
        dto.name !== undefined ||
        dto.description !== undefined ||
        dto.agentId !== undefined ||
        dto.order !== undefined;
      if (structuralTouched) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: '部门负责人仅允许修改部门共享开关，不允许修改组织结构与部门属性',
        });
      }
      const md = dto.metadata;
      if (!md || typeof md !== 'object' || Array.isArray(md)) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: 'metadata 必须为对象',
        });
      }
      const allowKeys = new Set(['allowDeptSharedSkills', 'allowDeptSharedMemory']);
      const keys = Object.keys(md);
      const illegal = keys.filter((k) => !allowKeys.has(k));
      if (illegal.length > 0) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: `不允许修改 metadata 字段：${illegal.join(', ')}`,
        });
      }
      const base = (node.metadata ?? {}) as Record<string, any>;
      const next: Record<string, any> = { ...base };
      if (keys.includes('allowDeptSharedSkills')) {
        next.allowDeptSharedSkills = Boolean((md as any).allowDeptSharedSkills);
      }
      if (keys.includes('allowDeptSharedMemory')) {
        next.allowDeptSharedMemory = Boolean((md as any).allowDeptSharedMemory);
      }
      dto = { ...dto, metadata: next };
    }

    if (dto.parentId && dto.parentId !== node.parentId) {
      await this.assertNodeExists(dto.parentId, companyId, '父节点不存在');
      await this.assertNoCycle(id, dto.parentId, companyId);
    }

    const before = this.toSerializableNode(node);
    let nextMetadata = dto.metadata ?? node.metadata;
    let nextDescription = dto.description ?? node.description;

    if (node.type === 'department' && isPrivileged) {
      const capabilityTouched =
        dto.responsibilitySummary !== undefined ||
        dto.description !== undefined ||
        dto.taskTypeTags !== undefined ||
        dto.excludesTaskTypeTags !== undefined;
      if (capabilityTouched) {
        const mergedMeta = mergeDepartmentMetadataPatch(
          (node.metadata ?? {}) as Record<string, unknown>,
          {
            responsibilitySummary: dto.responsibilitySummary ?? dto.description ?? node.description,
            description: dto.description ?? node.description,
            taskTypeTags: dto.taskTypeTags,
            excludesTaskTypeTags: dto.excludesTaskTypeTags,
          },
        );
        const summary = assertResponsibilitySummaryPresent({
          responsibilitySummary: String(mergedMeta.responsibilitySummary ?? ''),
          description: nextDescription ?? undefined,
        });
        mergedMeta.responsibilitySummary = summary;
        nextMetadata = mergedMeta;
        nextDescription = summary;
      } else if (dto.description !== undefined) {
        const summary = assertResponsibilitySummaryPresent({
          responsibilitySummary: dto.description,
          description: dto.description,
        });
        nextDescription = summary;
        nextMetadata = mergeDepartmentMetadataPatch((node.metadata ?? {}) as Record<string, unknown>, {
          responsibilitySummary: summary,
        });
      }
    }

    Object.assign(node, {
      parentId: dto.parentId ?? node.parentId,
      type: dto.type ?? node.type,
      name: dto.name ?? node.name,
      description: nextDescription,
      agentId: dto.agentId ?? node.agentId,
      order: dto.order ?? node.order,
      metadata: nextMetadata,
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
    const rows = (await this.findDescendantAgents(nodeId, true)) as unknown as Record<
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
        platformDepartmentSlug:
          typeof node.metadata?.platformDepartmentSlug === 'string'
            ? node.metadata.platformDepartmentSlug
            : undefined,
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
