/**
 * 集合命名空间：与 memory_collections.namespace 唯一约束对应
 */
export function companyNamespace(): string {
  return 'company';
}

/** 2026+：按平台部门 slug 的稳定命名空间 */
export function departmentNamespaceFromSlug(slug: string): string {
  return `department:${slug}`;
}

/** 历史节点仅有 nodeId、无 platformDepartmentSlug 时使用 */
export function departmentNamespaceLegacy(organizationNodeId: string): string {
  return `dept:${organizationNodeId}`;
}

export function resolveDepartmentMemoryNamespace(params: {
  organizationNodeId: string;
  platformDepartmentSlug?: string | null;
}): string {
  const s = params.platformDepartmentSlug?.trim();
  if (s) return departmentNamespaceFromSlug(s);
  return departmentNamespaceLegacy(params.organizationNodeId);
}

/**
 * 使用 {@link resolveDepartmentMemoryNamespace}（优先 slug）
 */
export function departmentNamespace(organizationNodeId: string): string {
  return departmentNamespaceLegacy(organizationNodeId);
}

export function agentNamespace(agentId: string): string {
  return `agent:${agentId}`;
}

export function sessionNamespace(roomId: string): string {
  return `session:${roomId}`;
}

/**
 * Project-scoped namespace (temporary agents are isolated by projectId).
 * projectId maps to projects.id.
 */
export function projectNamespace(projectId: string): string {
  return `project:${projectId}`;
}
