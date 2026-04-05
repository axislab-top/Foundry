/**
 * Memory namespaces for supervisor lessons.
 * Align with MemoryModule conventions; max length per StoreMemoryDto.namespace.
 */
export const SUPERVISOR_LESSON_NAMESPACE = 'lesson:company';

export function lessonDepartmentNamespace(organizationNodeId: string): string {
  return `lesson:dept:${organizationNodeId}`;
}

export function lessonAgentNamespace(agentId: string): string {
  return `lesson:agent:${agentId}`;
}

export function lessonMetadataKind(): 'supervisor_lesson' {
  return 'supervisor_lesson';
}

export interface LessonPartitionContext {
  assigneeType?: string | null;
  assigneeId?: string | null;
  /** When assignee is an agent, their org node (for dept-scoped mirror). */
  agentOrganizationNodeId?: string | null;
}

/**
 * All logical partitions that apply (company always + optional dept/agent).
 */
export function resolveSupervisorLessonNamespaces(ctx: LessonPartitionContext): string[] {
  const out = new Set<string>();
  out.add(SUPERVISOR_LESSON_NAMESPACE);
  const aid = ctx.assigneeId?.trim();
  if (!aid) {
    return [...out];
  }
  if (ctx.assigneeType === 'agent') {
    out.add(lessonAgentNamespace(aid));
    const org = ctx.agentOrganizationNodeId?.trim();
    if (org) {
      out.add(lessonDepartmentNamespace(org));
    }
  } else if (ctx.assigneeType === 'organization_node') {
    out.add(lessonDepartmentNamespace(aid));
  }
  return [...out];
}

/**
 * Best-practice dual-write: always `lesson:company` (CEO / 全局检索) +
 * at most one more specific namespace to avoid triple embedding cost.
 * Prefers agent > department when both exist.
 */
export function pickMemoryWriteTargets(namespaces: string[]): string[] {
  const company = SUPERVISOR_LESSON_NAMESPACE;
  const rest = namespaces.filter((n) => n !== company);
  if (rest.length === 0) {
    return [company];
  }
  const agentNs = rest.find((n) => n.startsWith('lesson:agent:'));
  if (agentNs) {
    return [company, agentNs];
  }
  const deptNs = rest.find((n) => n.startsWith('lesson:dept:'));
  if (deptNs) {
    return [company, deptNs];
  }
  return [company];
}
