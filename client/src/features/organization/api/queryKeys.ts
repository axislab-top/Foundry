export const organizationKeys = {
  all: ["organization"] as const,
  tree: (companyId: string | undefined) => ["organization", "tree", companyId] as const,
  agents: (companyId: string | undefined) => ["organization", "agents", companyId] as const,
  platformDepartments: () => ["organization", "platform-departments"] as const,
  marketplacePresets: (search?: string) =>
    ["organization", "marketplace-presets", search?.trim() ?? ""] as const,
  agentWorkspace: (agentId: string | undefined) => ["organization", "agent-workspace", agentId] as const,
  tasks: (companyId: string | undefined) => ["organization", "tasks", companyId] as const,
  membership: (companyId: string | undefined) => ["organization", "membership", companyId] as const,
};
