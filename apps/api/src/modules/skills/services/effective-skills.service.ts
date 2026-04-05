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

  async getEffectiveSkillIdsForAgent(agentId: string, companyId: string): Promise<string[]> {
    const direct = await this.agentSkillsRepo.find({
      where: { agentId, companyId },
      select: ['skillId'],
    });
    const ids = new Set<string>(direct.map((r) => r.skillId));

    const agent = await this.agentsRepo.findOne({
      where: { id: agentId, companyId },
      select: ['organizationNodeId'],
    });
    if (!agent?.organizationNodeId) {
      return [...ids];
    }

    const chainRows: { id: string }[] = await this.agentsRepo.query(
      `
      WITH RECURSIVE chain AS (
        SELECT id, parent_id
        FROM organization_nodes
        WHERE id = $1 AND company_id = $2
        UNION ALL
        SELECT n.id, n.parent_id
        FROM organization_nodes n
        JOIN chain c ON c.parent_id = n.id
        WHERE n.company_id = $2
      )
      SELECT id FROM chain
      `,
      [agent.organizationNodeId, companyId],
    );

    const nodeIds = chainRows.map((r) => r.id);
    if (nodeIds.length === 0) {
      return [...ids];
    }

    const rows = await this.orgNodeSkillsRepo.find({
      where: { companyId, organizationNodeId: In(nodeIds) },
    });
    for (const r of rows) {
      ids.add(r.skillId);
    }

    return [...ids];
  }
}
