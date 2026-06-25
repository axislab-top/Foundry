export const marketplaceKeys = {
  all: ["marketplace"] as const,
  agents: (companyId: string | undefined, search: string) =>
    ["marketplace", "agents", companyId, search] as const,
  agentDetail: (id: string | undefined) => ["marketplace", "agent", id] as const,
};
