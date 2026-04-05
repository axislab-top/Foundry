/**
 * 集合命名空间：与 memory_collections.namespace 唯一约束对应
 */
export function companyNamespace(): string {
  return 'company';
}

export function departmentNamespace(organizationNodeId: string): string {
  return `dept:${organizationNodeId}`;
}

export function agentNamespace(agentId: string): string {
  return `agent:${agentId}`;
}

export function sessionNamespace(roomId: string): string {
  return `session:${roomId}`;
}
