import type { FactsSourceMeta } from './facts.js';

/** 编制成员行（OrgRoster SSOT） */
export type OrgRosterMember = {
  agentId: string;
  displayName: string;
  role: string;
  organizationNodeId: string;
  organizationNodeName: string;
  reportsToAgentId?: string | null;
  inCurrentRoom: boolean;
  status: 'active' | 'inactive' | 'suspended' | string;
  /** 来自 organization_nodes.agent_id */
  boundOnOrgTree: boolean;
  /** 仅 agents.organization_node_id，树上无节点绑定 */
  agentsTableOnly: boolean;
};

export type OrgRosterAnchor = {
  organizationNodeId: string;
  departmentSlug: string | null;
  departmentDisplayName: string;
  directorAgentId?: string | null;
};

export type OrgRosterPack = {
  revision: string;
  scope: 'company' | 'department' | 'node';
  anchor: OrgRosterAnchor;
  members: OrgRosterMember[];
  counts: {
    total: number;
    employees: number;
    directors: number;
    inCurrentRoom: number;
    syncDriftAgentsTableOnly: number;
  };
  sourceMeta: FactsSourceMeta[];
};
