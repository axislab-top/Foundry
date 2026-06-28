import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Agent } from '../../agents/entities/agent.entity.js';
import { AgentSkill } from '../../agents/entities/agent-skill.entity.js';
import { OrganizationNodeSkill } from '../../organization/entities/organization-node-skill.entity.js';

/**
 * Effective skills = direct agent bindings ∪ skills attached to org nodes on the path to root.
 */
@Injectable()
export class EffectiveSkillsService {
  constructor(
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(AgentSkill)
    private readonly agentSkillsRepo: Repository<AgentSkill>,
    @InjectRepository(OrganizationNodeSkill)
    private readonly orgNodeSkillsRepo: Repository<OrganizationNodeSkill>,
  ) {}

  async getDirectSkillIdsForAgent(agentId: string, companyId: string): Promise<string[]> {
    const direct = await this.agentSkillsRepo.find({
      where: { agentId, companyId },
      select: ['skillId'],
    });
    return direct.map((r) => r.skillId);
  }

  async getDepartmentSharingContextForAgent(params: {
    agentId: string;
    companyId: string;
  }): Promise<{
    role: string | null;
    departmentSlug: string | null;
    /** 祖先链上 `type=department` 的节点 id；供 Worker 记忆层级检索传入 organizationNodeId */
    departmentOrganizationNodeId: string | null;
    allowDeptSharedSkills: boolean;
    allowDeptSharedMemory: boolean;
  }> {
    const agent = await this.agentsRepo.findOne({
      where: { id: params.agentId, companyId: params.companyId },
      select: ['organizationNodeId', 'role'],
    });
    const role = agent?.role ?? null;
    if (!agent?.organizationNodeId) {
      return {
        role,
        departmentSlug: null,
        departmentOrganizationNodeId: null,
        allowDeptSharedSkills: false,
        allowDeptSharedMemory: false,
      };
    }
    const chainRows: Array<{
      id: string;
      type: string;
      metadata: Record<string, unknown> | null;
      depth: number;
    }> = await this.agentsRepo.query(
      `
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, type, metadata, 0 AS depth
        FROM organization_nodes
        WHERE id = $1 AND company_id = $2
        UNION ALL
        SELECT n.id, n.parent_id, n.type, n.metadata, c.depth + 1
        FROM organization_nodes n
        JOIN chain c ON c.parent_id = n.id
        WHERE n.company_id = $2
      )
      SELECT id, type, metadata, depth FROM chain ORDER BY depth ASC
      `,
      [agent.organizationNodeId, params.companyId],
    );
    const dept = Array.isArray(chainRows) ? chainRows.find((r) => String(r.type ?? '').trim() === 'department') : null;
    const departmentOrganizationNodeId = dept?.id ? String(dept.id).trim() : null;
    const md = dept?.metadata ?? null;
    const departmentSlug =
      md && typeof (md as any).platformDepartmentSlug === 'string' && String((md as any).platformDepartmentSlug).trim()
        ? String((md as any).platformDepartmentSlug).trim()
        : null;
    const allowDeptSharedSkills =
      md && typeof (md as any).allowDeptSharedSkills === 'boolean' ? Boolean((md as any).allowDeptSharedSkills) : false;
    const explicitDeptMemory =
      md && typeof (md as any).allowDeptSharedMemory === 'boolean' ? Boolean((md as any).allowDeptSharedMemory) : null;
    const roleNorm = String(role ?? '').trim().toLowerCase();
    /** 挂在部门下的主管与执行岗默认可读部门记忆命名空间；仅当 metadata 显式 `allowDeptSharedMemory: false` 时关闭。 */
    const defaultDeptMemoryForDeptMembers =
      Boolean(dept) && (roleNorm === 'director' || roleNorm === 'executor');
    const allowDeptSharedMemory = defaultDeptMemoryForDeptMembers
      ? explicitDeptMemory !== false
      : explicitDeptMemory === true;
    return {
      role,
      departmentSlug,
      departmentOrganizationNodeId,
      allowDeptSharedSkills,
      allowDeptSharedMemory,
    };
  }

  async getEffectiveSkillIdsForAgent(agentId: string, companyId: string): Promise<string[]> {
    const directIds = await this.getDirectSkillIdsForAgent(agentId, companyId);
    const ids = new Set<string>(directIds);

    const agent = await this.agentsRepo.findOne({
      where: { id: agentId, companyId },
      select: ['organizationNodeId', 'role'],
    });
    if (!agent?.organizationNodeId) {
      return [...ids];
    }

    // CEO agent keeps legacy behavior (full chain to root).
    // Non-CEO agents default to NO inheritance; can opt-in to department-scoped sharing only.
    const chainRows: Array<{
      id: string;
      parent_id: string | null;
      type: string;
      metadata: Record<string, unknown> | null;
      depth: number;
    }> = await this.agentsRepo.query(
      `
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, type, metadata, 0 AS depth
        FROM organization_nodes
        WHERE id = $1 AND company_id = $2
        UNION ALL
        SELECT n.id, n.parent_id, n.type, n.metadata, c.depth + 1
        FROM organization_nodes n
        JOIN chain c ON c.parent_id = n.id
        WHERE n.company_id = $2
      )
      SELECT id, parent_id, type, metadata, depth FROM chain ORDER BY depth ASC
      `,
      [agent.organizationNodeId, companyId],
    );

    if (!Array.isArray(chainRows) || chainRows.length === 0) {
      return [...ids];
    }

    let nodeIds: string[] = [];
    if (agent.role === 'ceo') {
      nodeIds = chainRows.map((r) => r.id);
    } else {
      const dept = chainRows.find((r) => String(r.type ?? '').trim() === 'department');
      const allowDeptSharedSkills =
        dept &&
        dept.metadata &&
        typeof (dept.metadata as any).allowDeptSharedSkills === 'boolean' &&
        Boolean((dept.metadata as any).allowDeptSharedSkills);
      if (!dept || !allowDeptSharedSkills) {
        return [...ids];
      }
      const deptDepth = Number.isFinite(dept.depth) ? dept.depth : 0;
      nodeIds = chainRows.filter((r) => (Number.isFinite(r.depth) ? r.depth : 0) <= deptDepth).map((r) => r.id);
    }

    if (nodeIds.length === 0) return [...ids];

    const rows = await this.orgNodeSkillsRepo.find({
      where: { companyId, organizationNodeId: In(nodeIds) },
    });
    for (const r of rows) {
      ids.add(r.skillId);
    }

    return [...ids];
  }
}
