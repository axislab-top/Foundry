export type OrgTreeNode = {
  id: string;
  parentId: string | null;
  type: "board" | "ceo" | "department" | "agent";
  name: string;
  description?: string | null;
  agentId: string | null;
  order: number;
  metadata?: Record<string, unknown> | null;
  children: OrgTreeNode[];
};

export type ApiAgent = {
  id: string;
  name: string;
  role: string;
  status: string;
  organizationNodeId: string | null;
  expertise?: string | null;
  avatarUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  updatedAt?: string | null;
};

export type AgentWorkspaceStep = {
  id: string;
  title: string;
  status: string;
  progress: number;
  assigneeId: string | null;
  updatedAt: string;
};

export type AgentWorkspace = {
  agent: ApiAgent;
  primaryTask: {
    id: string;
    title: string;
    status: string;
    progress: number;
    blockedReason: string | null;
    updatedAt: string;
    steps: AgentWorkspaceStep[];
  } | null;
};

export type PlatformDepartmentApiRow = {
  id: string;
  slug: string;
  displayName: string;
  category: string | null;
  icon: string | null;
  responsibilitySummary: string | null;
  sortOrder: number;
};

export type MarketplaceAgentPreset = {
  id: string;
  slug: string;
  name: string;
  expertise: string | null;
  description: string | null;
  agentCategory: string;
  departmentRoles: string[];
  iconUrl: string | null;
  boundModelName: string | null;
  skillTags: string[];
  usageCount: number;
  rating: number | null;
  catalogPricing: {
    displayLabel: string | null;
    dailyPriceCents: number | null;
  } | null;
};

export type CreateMarketplaceHirePayload = {
  marketplaceAgentId: string;
  organizationNodeId: string;
  requestedReason?: string;
};

export type HireMarketplaceAgentResult = {
  hireRequestId: string;
  status: string;
  resultAgentId: string | null;
  pendingApproval: boolean;
  materializePending: boolean;
  presetName?: string;
};
