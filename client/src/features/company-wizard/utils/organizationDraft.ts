import type { DepartmentPlacement, OrgPreviewNode } from "@/features/company-wizard/types/organizationDraft";

function resolveAgentLabel(slug: string, nameMap?: Map<string, string>): string {
  return nameMap?.get(slug) ?? slug;
}

export function placementsToPreviewGraph(
  placements: DepartmentPlacement[],
  nameMap?: Map<string, string>,
): OrgPreviewNode[] {
  const nodes: OrgPreviewNode[] = [
    { id: "board", type: "board", label: "董事会" },
    {
      id: "ceo",
      type: "ceo",
      label: resolveAgentLabel("ceo", nameMap),
      slug: "ceo",
      parentId: "board",
      roleHint: "战略与协调",
    },
  ];

  placements.forEach((dept, index) => {
    const deptId = `dept-${index}`;
    const agentCount = (dept.headAgentSlug ? 1 : 0) + (dept.memberAgentSlugs?.length ?? 0);
    nodes.push({
      id: deptId,
      type: "department",
      label: dept.name,
      slug: dept.platformDepartmentSlug,
      parentId: "ceo",
      roleHint: agentCount > 0 ? `${agentCount} 位 Agent` : undefined,
    });
    if (dept.headAgentSlug) {
      nodes.push({
        id: `${deptId}-head`,
        type: "agent",
        label: resolveAgentLabel(dept.headAgentSlug, nameMap),
        slug: dept.headAgentSlug,
        parentId: deptId,
        roleHint: "部门主管",
      });
    }
    (dept.memberAgentSlugs ?? []).forEach((slug, memberIndex) => {
      nodes.push({
        id: `${deptId}-member-${memberIndex}`,
        type: "agent",
        label: resolveAgentLabel(slug, nameMap),
        slug,
        parentId: deptId,
        roleHint: "执行岗",
      });
    });
  });

  return nodes;
}

export function computeDraftStats(placements: DepartmentPlacement[]) {
  const agentCount =
    placements.reduce(
      (sum, p) => sum + (p.headAgentSlug ? 1 : 0) + (p.memberAgentSlugs?.length ?? 0),
      0,
    ) + 1;
  return {
    depth: 3,
    deptCount: placements.length,
    agentCount,
    estMonthlyCost: Math.round(agentCount * 120 + placements.length * 40),
  };
}

export function previewGraphToPlacements(nodes: OrgPreviewNode[]): DepartmentPlacement[] {
  const departments = nodes.filter((n) => n.type === "department");
  return departments.map((dept) => {
    const agents = nodes.filter((n) => n.parentId === dept.id && n.type === "agent");
    const head = agents.find((a) => a.roleHint === "部门主管");
    const members = agents
      .filter((a) => a.roleHint !== "部门主管")
      .map((a) => a.slug ?? a.label)
      .filter(Boolean);
    return {
      name: dept.label,
      headAgentSlug: head?.slug ?? head?.label ?? null,
      memberAgentSlugs: members,
      platformDepartmentSlug: dept.slug,
    };
  });
}
