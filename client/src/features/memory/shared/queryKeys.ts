export const memoryKeys = {
  all: ["memory"] as const,
  list: (companyId: string | undefined, scope: string, params: unknown) =>
    ["memory", "list", companyId ?? "", scope, params] as const,
  browse: (companyId: string | undefined, scope: string, params: unknown) =>
    ["memory", "browse", companyId ?? "", scope, params] as const,
  agents: (companyId: string | undefined) => ["memory", "agents", companyId ?? ""] as const,
  companyDepartments: (companyId: string | undefined) =>
    ["memory", "company-departments", companyId ?? ""] as const,
};
