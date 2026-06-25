export type SkillStatus = 'active' | 'draft' | 'deprecated' | 'in_review';
export type RiskLevel = 'low' | 'medium' | 'high';

export type Skill = {
  id: string;
  iconText: string;
  name: string;
  version: string;
  shortDescription: string;
  category: string;
  departments: string[];
  status: SkillStatus;
  riskLevel: RiskLevel;
  bindingAgents: number;
  bindingTools: number;
  bindingMcpTools: number;
  monthlyCalls: number;
  monthlyTokens: number;
  createdBy: string;
  lastUpdatedAt: string;
  createdAt: string;
  monthlyCostUsd: number;
  riskScore: number;
};

export type StatusBadge = 'Draft' | 'Active' | 'Deprecated';

export type BoundTool = {
  id: string;
  name: string;
  version: string;
  overridden: boolean;
};

export type SkillDetailDraft = {
  /** Full SKILL.md document (AgentSkills); sole source for prompt / frontmatter. */
  skillMd: string;
  statusBadge: StatusBadge;
  changeReason: string;
  boundTools: BoundTool[];
  boundMcpTools: BoundTool[];
};
