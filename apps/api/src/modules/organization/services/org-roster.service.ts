import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { FactsSourceMeta, OrgRosterMember, OrgRosterPack } from '@contracts/types';
import { TenantContextService } from '@service/tenant';
import { Agent } from '../../agents/entities/agent.entity.js';
import { OrganizationNode } from '../entities/organization-node.entity.js';
import { OrganizationService } from './organization.service.js';

type DeptAnchor = {
  organizationNodeId: string;
  departmentSlug: string | null;
  departmentDisplayName: string;
};

@Injectable()
export class OrgRosterService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly organizationService: OrganizationService,
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
  ) {}

  private getCompanyIdOrThrow(): string {
    const id = this.tenantContext.getCompanyId();
    if (!id) throw new BadRequestException('company context required');
    return id;
  }

  /**
   * 部门/节点编制 SSOT：合并 organization_nodes.agent_id 与 agents.organization_node_id。
   */
  async buildDepartmentRoster(params: {
    anchorOrganizationNodeId: string;
    /** 当前群/agent 房内的 agent memberId，用于 inCurrentRoom */
    roomAgentIds?: string[];
    scope?: 'department' | 'node';
  }): Promise<OrgRosterPack> {
    const companyId = this.getCompanyIdOrThrow();
    const anchorId = String(params.anchorOrganizationNodeId ?? '').trim();
    if (!anchorId) {
      throw new BadRequestException('anchorOrganizationNodeId is required');
    }

    const sourceMeta: FactsSourceMeta[] = [];
    const t0 = Date.now();
    const anchorNode = await this.nodesRepo.findOne({
      where: { id: anchorId, companyId } as any,
      select: ['id', 'name', 'type', 'metadata', 'agentId'],
    });
    if (!anchorNode) {
      throw new NotFoundException('organization anchor node not found');
    }
    sourceMeta.push({ source: 'organization_nodes.findOne', ok: true, latencyMs: Date.now() - t0 });

    const anchor = this.anchorFromNode(anchorNode);
    const subtreeIds = await this.collectSubtreeNodeIds(anchorId, companyId);
    sourceMeta.push({
      source: 'organization.subtree_ids',
      ok: true,
      note: `count=${subtreeIds.length}`,
    });

    const t1 = Date.now();
    const fromTree = await this.organizationService.findDescendantAgents(anchorId, true);
    sourceMeta.push({ source: 'organization.findDescendantAgents', ok: true, latencyMs: Date.now() - t1 });

    const nodeNameById = new Map<string, string>();
    for (const raw of fromTree as unknown as Array<Record<string, unknown>>) {
      const nid = String(raw.id ?? '').trim();
      if (nid) nodeNameById.set(nid, String(raw.name ?? '').trim() || nid);
    }

    const treeAgentIds = new Set<string>();
    const treeBindings = new Map<string, { organizationNodeId: string; organizationNodeName: string }>();
    for (const raw of fromTree as unknown as Array<Record<string, unknown>>) {
      const aid = String(raw.agent_id ?? raw.agentId ?? '').trim();
      const nid = String(raw.id ?? '').trim();
      if (!aid || !nid) continue;
      treeAgentIds.add(aid);
      treeBindings.set(aid, {
        organizationNodeId: nid,
        organizationNodeName: nodeNameById.get(nid) ?? nid,
      });
    }

    const t2 = Date.now();
    const agentsFromTable =
      subtreeIds.length > 0
        ? await this.agentsRepo.find({
            where: {
              companyId,
              status: 'active' as const,
              organizationNodeId: In(subtreeIds),
            } as any,
            select: ['id', 'name', 'role', 'organizationNodeId', 'reportsToAgentId', 'status'],
            take: 500,
          })
        : [];
    sourceMeta.push({ source: 'agents.by_subtree_org_nodes', ok: true, latencyMs: Date.now() - t2 });

    const allAgentIds = new Set<string>([...treeAgentIds, ...agentsFromTable.map((a) => a.id)]);
    const agentRows =
      allAgentIds.size > 0
        ? await this.agentsRepo.find({
            where: { companyId, id: In([...allAgentIds]) } as any,
            select: ['id', 'name', 'role', 'organizationNodeId', 'reportsToAgentId', 'status'],
            take: 500,
          })
        : [];
    const agentById = new Map(agentRows.map((a) => [a.id, a]));

    const roomAgentIds = new Set(
      (params.roomAgentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean),
    );
    if (roomAgentIds.size > 0) {
      sourceMeta.push({ source: 'room_agent_ids_overlay', ok: true, note: `count=${roomAgentIds.size}` });
    }

    const members: OrgRosterMember[] = [];
    let syncDrift = 0;
    for (const id of allAgentIds) {
      const a = agentById.get(id);
      if (!a) continue;
      const onTree = treeAgentIds.has(id);
      const tableOnly = !onTree;
      if (tableOnly) syncDrift += 1;
      const binding = treeBindings.get(id);
      const orgNodeId =
        binding?.organizationNodeId ?? (String(a.organizationNodeId ?? '').trim() || anchorId);
      const orgNodeName =
        binding?.organizationNodeName ??
        nodeNameById.get(orgNodeId) ??
        (orgNodeId === anchorId ? anchor.departmentDisplayName : orgNodeId);
      members.push({
        agentId: id,
        displayName: String(a.name ?? '').trim() || id,
        role: String(a.role ?? 'unknown'),
        organizationNodeId: orgNodeId,
        organizationNodeName: orgNodeName,
        reportsToAgentId: a.reportsToAgentId ?? null,
        inCurrentRoom: roomAgentIds.has(id),
        status: String(a.status ?? 'active'),
        boundOnOrgTree: onTree,
        agentsTableOnly: tableOnly,
      });
    }

    members.sort((a, b) => {
      const roleOrder = (r: string) => (r === 'director' ? 0 : r === 'executor' ? 1 : 2);
      const d = roleOrder(a.role) - roleOrder(b.role);
      if (d !== 0) return d;
      return a.displayName.localeCompare(b.displayName, 'zh');
    });

    const revision = `roster:${anchorId}:${members.length}:${syncDrift}:${subtreeIds.length}`;

    const directors = members.filter((m) => m.role === 'director').length;
    const employees = members.filter((m) => m.role === 'executor' || m.role === 'employee').length;

    return {
      revision,
      scope: params.scope ?? 'department',
      anchor: {
        organizationNodeId: anchor.organizationNodeId,
        departmentSlug: anchor.departmentSlug,
        departmentDisplayName: anchor.departmentDisplayName,
        directorAgentId: members.find((m) => m.role === 'director')?.agentId ?? anchorNode.agentId ?? null,
      },
      members,
      counts: {
        total: members.length,
        employees,
        directors,
        inCurrentRoom: members.filter((m) => m.inCurrentRoom).length,
        syncDriftAgentsTableOnly: syncDrift,
      },
      sourceMeta,
    };
  }

  async resolveDepartmentAnchorForAgent(agentId: string): Promise<DeptAnchor | null> {
    const companyId = this.getCompanyIdOrThrow();
    const aid = String(agentId ?? '').trim();
    if (!aid) return null;
    const agent = await this.agentsRepo.findOne({
      where: { id: aid, companyId },
      select: ['organizationNodeId'],
    });
    if (!agent?.organizationNodeId) return null;

    const chainRows: Array<{ id: string; type: string; name: string; metadata: Record<string, unknown> | null }> =
      await this.agentsRepo.query(
        `
        WITH RECURSIVE chain AS (
          SELECT id, parent_id, type, name, metadata, 0 AS depth
          FROM organization_nodes
          WHERE id = $1 AND company_id = $2
          UNION ALL
          SELECT n.id, n.parent_id, n.type, n.name, n.metadata, c.depth + 1
          FROM organization_nodes n
          JOIN chain c ON c.parent_id = n.id
          WHERE n.company_id = $2
        )
        SELECT id, type, name, metadata FROM chain ORDER BY depth ASC
        `,
        [agent.organizationNodeId, companyId],
      );
    const dept = Array.isArray(chainRows) ? chainRows.find((r) => String(r.type ?? '').trim() === 'department') : null;
    if (!dept?.id) return null;
    const md = dept.metadata ?? null;
    const slug =
      md && typeof (md as { platformDepartmentSlug?: unknown }).platformDepartmentSlug === 'string'
        ? String((md as { platformDepartmentSlug: string }).platformDepartmentSlug).trim()
        : null;
    return {
      organizationNodeId: String(dept.id).trim(),
      departmentSlug: slug || null,
      departmentDisplayName: String(dept.name ?? '').trim() || String(dept.id),
    };
  }

  /** director 仅允许查本部门锚点或子树；ceo 不限制 */
  async assertNodeRosterAccess(params: {
    requesterRole: string;
    requesterAgentId: string;
    targetNodeId: string;
  }): Promise<void> {
    const role = String(params.requesterRole ?? '').trim().toLowerCase();
    if (role === 'ceo') return;
    const anchor = await this.resolveDepartmentAnchorForAgent(params.requesterAgentId);
    if (!anchor) {
      throw new ForbiddenException('requester has no department anchor for roster query');
    }
    const companyId = this.getCompanyIdOrThrow();
    const subtree = await this.collectSubtreeNodeIds(anchor.organizationNodeId, companyId);
    const target = String(params.targetNodeId ?? '').trim();
    if (!subtree.includes(target)) {
      throw new ForbiddenException('roster query target node outside requester department subtree');
    }
  }

  private anchorFromNode(node: OrganizationNode): DeptAnchor {
    const md = (node.metadata ?? {}) as Record<string, unknown>;
    const slug =
      typeof md.platformDepartmentSlug === 'string' && md.platformDepartmentSlug.trim()
        ? md.platformDepartmentSlug.trim()
        : null;
    return {
      organizationNodeId: node.id,
      departmentSlug: slug,
      departmentDisplayName: String(node.name ?? '').trim() || node.id,
    };
  }

  private async collectSubtreeNodeIds(anchorNodeId: string, companyId: string): Promise<string[]> {
    const rows = await this.nodesRepo.query(
      `
      WITH RECURSIVE subtree AS (
        SELECT id FROM organization_nodes WHERE id = $1 AND company_id = $2
        UNION ALL
        SELECT n.id FROM organization_nodes n
        JOIN subtree s ON n.parent_id = s.id
        WHERE n.company_id = $2
      )
      SELECT id FROM subtree
      `,
      [anchorNodeId, companyId],
    );
    return (rows ?? []).map((r: { id: string }) => String(r.id ?? '').trim()).filter(Boolean);
  }
}
