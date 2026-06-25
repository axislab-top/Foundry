import type { OrgTreeNode } from "../types/api";

export type OrgNodeLite = { id: string; parentId: string | null; type: OrgTreeNode["type"] };

export function flattenOrgTree(nodes: OrgTreeNode[]): OrgTreeNode[] {
  const out: OrgTreeNode[] = [];
  const walk = (list: OrgTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function buildNodeIdToDepartmentIdMap(nodes: OrgNodeLite[]): Map<string, string | null> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, string | null>();
  for (const start of nodes) {
    const seen = new Set<string>();
    let cur: string | null = start.id;
    let found: string | null = null;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const n = byId.get(cur);
      if (!n) break;
      if (n.type === "department") {
        found = n.id;
        break;
      }
      cur = n.parentId;
    }
    out.set(start.id, found);
  }
  return out;
}

export function collectPlatformDepartmentSlugs(tree: OrgTreeNode[]): Set<string> {
  const slugs = new Set<string>();
  for (const n of flattenOrgTree(tree)) {
    if (n.type !== "department") continue;
    const raw = n.metadata?.platformDepartmentSlug;
    if (typeof raw === "string" && raw.trim()) slugs.add(raw.trim());
  }
  return slugs;
}

export function findDepartments(tree: OrgTreeNode[]): OrgTreeNode[] {
  return flattenOrgTree(tree).filter((n) => n.type === "department");
}

export function findCeoNode(tree: OrgTreeNode[]): OrgTreeNode | null {
  return flattenOrgTree(tree).find((n) => n.type === "ceo") ?? null;
}

export function findAgentSlotsInDepartment(tree: OrgTreeNode[], departmentId: string): OrgTreeNode[] {
  const flat = flattenOrgTree(tree);
  const dept = flat.find((n) => n.id === departmentId && n.type === "department");
  if (!dept) return [];
  const slots: OrgTreeNode[] = [];
  const walk = (nodes: OrgTreeNode[]) => {
    for (const n of nodes) {
      if (n.type === "agent" && !n.agentId) slots.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(dept.children ?? []);
  return slots;
}

export function resolveEmployeeHireTarget(
  tree: OrgTreeNode[],
  departmentId: string,
  preferredSlotId?: string,
): string | null {
  const dept = flattenOrgTree(tree).find((n) => n.id === departmentId && n.type === "department");
  if (!dept) return null;
  const slots = findAgentSlotsInDepartment(tree, departmentId);
  if (slots.length === 0) return departmentId;
  return slots.find((s) => s.id === preferredSlotId)?.id ?? slots[0].id;
}

export function resolveDirectorHireTarget(tree: OrgTreeNode[], departmentId: string): string | null {
  const dept = flattenOrgTree(tree).find((n) => n.id === departmentId && n.type === "department");
  if (!dept || dept.agentId) return null;
  return dept.id;
}
