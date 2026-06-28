import {
  partitionOfficeCanvas,
  collectPlatformDepartmentSlugs,
  buildNodeIdToDepartmentIdMap,
  findHireTargetsForCategory,
  findDepartments,
  findAgentSlotsInDepartment,
  resolveEmployeeHireTarget,
} from "../../../client/src/features/office/utils/orgTree";
import type { OrgTreeNode, OfficeAgent } from "../../../client/src/features/office/types";

function agent(id: string, orgNodeId: string | null, role = "executor"): OfficeAgent {
  return {
    id,
    name: id,
    role,
    status: "active",
    organizationNodeId: orgNodeId,
  };
}

describe("office orgTree utils", () => {
  const tree: OrgTreeNode[] = [
    {
      id: "board",
      parentId: null,
      type: "board",
      name: "Board",
      agentId: null,
      order: 0,
      children: [
        {
          id: "ceo",
          parentId: "board",
          type: "ceo",
          name: "CEO",
          agentId: null,
          order: 0,
          children: [
            {
              id: "dept-a",
              parentId: "ceo",
              type: "department",
              name: "产品部",
              agentId: null,
              order: 0,
              metadata: { platformDepartmentSlug: "product" },
              children: [
                {
                  id: "slot-1",
                  parentId: "dept-a",
                  type: "agent",
                  name: "Slot",
                  agentId: "a1",
                  order: 0,
                  children: [],
                },
              ],
            },
            {
              id: "ceo-slot",
              parentId: "ceo",
              type: "agent",
              name: "CEO Agent",
              agentId: "ceo-1",
              order: 1,
              children: [],
            },
          ],
        },
      ],
    },
  ];

  it("maps org nodes to nearest department ancestor", () => {
    const flat = [
      { id: "slot-1", parentId: "dept-a", type: "agent" as const },
      { id: "dept-a", parentId: "ceo", type: "department" as const },
      { id: "ceo-slot", parentId: "ceo", type: "agent" as const },
      { id: "ceo", parentId: "board", type: "ceo" as const },
    ];
    const map = buildNodeIdToDepartmentIdMap(flat);
    expect(map.get("slot-1")).toBe("dept-a");
    expect(map.get("ceo-slot")).toBeNull();
  });

  it("partitions leadership vs department floors", () => {
    const layout = partitionOfficeCanvas(tree, [
      agent("a1", "slot-1"),
      agent("ceo-1", "ceo-slot", "ceo"),
      agent("orphan", null),
    ]);
    expect(layout.leadership.map((a) => a.id).sort()).toEqual(["ceo-1", "orphan"].sort());
    expect(layout.floors).toHaveLength(1);
    expect(layout.floors[0].department.id).toBe("dept-a");
    expect(layout.floors[0].agents.map((a) => a.id)).toEqual(["a1"]);
  });

  it("collects platform department slugs from tree metadata", () => {
    const slugs = collectPlatformDepartmentSlugs(tree);
    expect(slugs.has("product")).toBe(true);
  });

  it("finds hire targets by marketplace agent category", () => {
    const employeeTargets = findHireTargetsForCategory(tree, "employee");
    expect(employeeTargets.every((n) => n.type === "agent" && !n.agentId)).toBe(true);

    const deptHeadTargets = findHireTargetsForCategory(tree, "department_head");
    expect(deptHeadTargets.some((n) => n.id === "dept-a")).toBe(true);
  });

  it("lists departments and empty agent slots within a department", () => {
    const depts = findDepartments(tree);
    expect(depts.map((d) => d.id)).toEqual(["dept-a"]);

    const emptySlots = findAgentSlotsInDepartment(tree, "dept-a");
    expect(emptySlots).toHaveLength(0);

    const treeWithEmptySlot: OrgTreeNode[] = [
      {
        ...tree[0],
        children: [
          {
            ...tree[0].children![0],
            children: [
              {
                ...tree[0].children![0].children![0],
                children: [
                  ...tree[0].children![0].children![0].children!,
                  {
                    id: "slot-empty",
                    parentId: "dept-a",
                    type: "agent",
                    name: "空槽",
                    agentId: null,
                    order: 1,
                    children: [],
                  },
                ],
              },
              tree[0].children![0].children![1],
            ],
          },
        ],
      },
    ];
    const slots = findAgentSlotsInDepartment(treeWithEmptySlot, "dept-a");
    expect(slots.map((s) => s.id)).toEqual(["slot-empty"]);
  });

  it("resolves employee hire target to department when no empty slots exist", () => {
    expect(resolveEmployeeHireTarget(tree, "dept-a")).toBe("dept-a");
  });
});
