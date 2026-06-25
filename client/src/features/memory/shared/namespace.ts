export function namespaceForCompany(): string {
  return "company";
}

export function namespaceForDepartment(slug: string): string {
  return `department:${slug}`;
}

export function namespaceForAgent(agentId: string): string {
  return `agent:${agentId}`;
}

/** 是否为部门级命名空间（含历史 dept: 前缀） */
export function isDepartmentNamespace(namespace: string): boolean {
  return namespace.startsWith("department:") || namespace.startsWith("dept:");
}

export function parseDepartmentSlugFromNamespace(namespace: string): string | null {
  if (namespace.startsWith("department:")) {
    return namespace.slice("department:".length) || null;
  }
  return null;
}

export function memoryMatchesDepartment(itemNamespace: string, deptSlug: string): boolean {
  if (!isDepartmentNamespace(itemNamespace)) return false;
  if (!deptSlug) return true;
  if (itemNamespace === namespaceForDepartment(deptSlug)) return true;
  return itemNamespace === `dept:${deptSlug}`;
}

/** 公司组织树中的部门（含 platform slug 与 nodeId） */
export type CompanyDepartmentRef = {
  slug: string;
  nodeId: string;
};

export function memoryMatchesCompanyDepartment(
  itemNamespace: string,
  dept: CompanyDepartmentRef | null,
): boolean {
  if (!isDepartmentNamespace(itemNamespace)) return false;
  if (!dept) return true;
  if (itemNamespace === namespaceForDepartment(dept.slug)) return true;
  if (itemNamespace === `dept:${dept.nodeId}`) return true;
  if (itemNamespace === `dept:${dept.slug}`) return true;
  return false;
}

export function isAgentNamespace(namespace: string): boolean {
  return namespace.startsWith("agent:");
}

export function parseAgentIdFromNamespace(namespace: string): string | null {
  if (!namespace.startsWith("agent:")) return null;
  return namespace.slice("agent:".length) || null;
}

export function memoryMatchesAgent(itemNamespace: string, agentId: string): boolean {
  if (!isAgentNamespace(itemNamespace)) return false;
  if (!agentId) return true;
  return itemNamespace === namespaceForAgent(agentId);
}
