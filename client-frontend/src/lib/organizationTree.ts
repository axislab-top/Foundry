import type { OrganizationTreeNode } from '../services/organizationApi';

/**
 * 客户端组织树辅助函数。
 * 部门归属语义与后端 `organization-department.util`、仪表盘 `departmentLoad` 一致（沿 parent 链找最近 `department`）。
 */

/** 前序遍历扁平化组织树 */
export function flattenOrganizationNodes(roots: OrganizationTreeNode[]): OrganizationTreeNode[] {
  const out: OrganizationTreeNode[] = [];
  const walk = (n: OrganizationTreeNode) => {
    out.push(n);
    for (const c of n.children ?? []) {
      walk(c);
    }
  };
  for (const r of roots) {
    walk(r);
  }
  return out;
}

export function nodesByIdFromRoots(roots: OrganizationTreeNode[]): Map<string, OrganizationTreeNode> {
  const m = new Map<string, OrganizationTreeNode>();
  for (const n of flattenOrganizationNodes(roots)) {
    m.set(n.id, n);
  }
  return m;
}

/** 从任意节点向上解析所属「部门」节点（含自身为 department 的情况） */
export function resolveAncestorDepartment(
  startNodeId: string | null | undefined,
  nodesById: Map<string, OrganizationTreeNode>,
): OrganizationTreeNode | null {
  if (!startNodeId) {
    return null;
  }
  const seen = new Set<string>();
  let cur: string | null = startNodeId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n = nodesById.get(cur);
    if (!n) {
      return null;
    }
    if (n.type === 'department') {
      return n;
    }
    cur = n.parentId;
  }
  return null;
}

export function collectDepartmentNodes(roots: OrganizationTreeNode[]): OrganizationTreeNode[] {
  const out: OrganizationTreeNode[] = [];
  const walk = (n: OrganizationTreeNode) => {
    if (n.type === 'department') {
      out.push(n);
    }
    for (const c of n.children ?? []) {
      walk(c);
    }
  };
  for (const r of roots) {
    walk(r);
  }
  return out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** 某节点及其全部后代组织节点 id（含根） */
export function collectSubtreeOrganizationNodeIds(node: OrganizationTreeNode): Set<string> {
  const s = new Set<string>([node.id]);
  for (const c of node.children ?? []) {
    for (const id of collectSubtreeOrganizationNodeIds(c)) {
      s.add(id);
    }
  }
  return s;
}
