import type { OrganizationNodeType } from '../../organization/entities/organization-node.entity.js';

/** 组织树投影（避免模块间循环依赖） */
export type OrgNodeLite = { id: string; parentId: string | null; type: OrganizationNodeType };

/**
 * 为每个组织节点计算「最近部门祖先」节点 id；无部门祖先时为 null。
 * 用于任务按部门汇总、筛选等与组织结构一致的口径。
 */
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
      if (!n) {
        break;
      }
      if (n.type === 'department') {
        found = n.id;
        break;
      }
      cur = n.parentId;
    }
    out.set(start.id, found);
  }
  return out;
}

/** 含 `rootId` 自身及其在树中的全部后代组织节点 id */
export function collectDescendantOrgNodeIds(rootId: string, nodes: OrgNodeLite[]): Set<string> {
  const childrenByParent = new Map<string | null, string[]>();
  for (const n of nodes) {
    const p = n.parentId;
    const list = childrenByParent.get(p) ?? [];
    list.push(n.id);
    childrenByParent.set(p, list);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.add(id);
    const kids = childrenByParent.get(id) ?? [];
    for (const k of kids) {
      stack.push(k);
    }
  }
  return out;
}
