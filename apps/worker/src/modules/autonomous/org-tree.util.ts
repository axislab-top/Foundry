/** 组织树节点（与 API OrganizationTreeNodeDto 对齐的最小形状） */
export interface OrgTreeNodeShape {
  id: string;
  name: string;
  type: string;
  children: OrgTreeNodeShape[];
}

export function collectOrganizationNodeIds(nodes: OrgTreeNodeShape[]): Set<string> {
  const ids = new Set<string>();
  const walk = (n: OrgTreeNodeShape) => {
    ids.add(n.id);
    for (const c of n.children ?? []) walk(c);
  };
  for (const root of nodes) walk(root);
  return ids;
}

export function compactOrgTreeForPrompt(nodes: OrgTreeNodeShape[], depth = 0): string {
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  for (const n of nodes) {
    lines.push(`${pad}- [${n.type}] ${n.name} (id=${n.id})`);
    if (n.children?.length) {
      lines.push(compactOrgTreeForPrompt(n.children, depth + 1));
    }
  }
  return lines.join('\n');
}
