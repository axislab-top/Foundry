import { buildOrgViewModel, getAvailablePlatformTemplates } from "../../../client/src/features/organization/utils/orgViewModel";
import type { ApiAgent, OrgTreeNode } from "../../../client/src/features/organization/types/api";
import type { TaskItem } from "../../../client/src/features/tasks/api/tasksTypes";

function apiAgent(id: string, orgNodeId: string | null, role = "executor", name?: string): ApiAgent {
  return {
    id,
    name: name ?? id,
    role,
    status: "active",
    organizationNodeId: orgNodeId,
    expertise: null,
    avatarUrl: null,
  };
}

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
        name: "创始人",
        description: "CEO",
        agentId: null,
        order: 0,
        children: [
          {
            id: "dept-a",
            parentId: "ceo",
            type: "department",
            name: "市场部",
            agentId: "dir-1",
            order: 0,
            metadata: { platformDepartmentSlug: "marketing" },
            children: [
              {
                id: "slot-1",
                parentId: "dept-a",
                type: "agent",
                name: "Slot",
                agentId: "emp-1",
                order: 0,
                children: [],
              },
            ],
          },
          {
            id: "dept-b",
            parentId: "ceo",
            type: "department",
            name: "财务部",
            agentId: null,
            order: 1,
            metadata: { platformDepartmentSlug: "finance" },
            children: [],
          },
        ],
      },
    ],
  },
];

describe("orgViewModel", () => {
  it("splits departments, director, and employees", () => {
    const agents: ApiAgent[] = [
      apiAgent("dir-1", "dept-a", "director", "林策"),
      apiAgent("emp-1", "slot-1", "executor", "文案助手"),
    ];
    const vm = buildOrgViewModel(tree, agents, []);

    expect(vm.founder.id).toBe("ceo");
    expect(vm.founder.name).toBe("创始人");
    expect(vm.departments).toHaveLength(2);
    expect(vm.departments[0].slug).toBe("marketing");
    expect(vm.departments[0].directorId).toBe("dir-1");
    expect(vm.departments[1].directorId).toBeNull();
    expect(vm.directors).toHaveLength(1);
    expect(vm.directors[0].departmentId).toBe("dept-a");
    expect(vm.agents).toHaveLength(1);
    expect(vm.agents[0].departmentId).toBe("dept-a");
  });

  it("aggregates task counts per agent", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const tasks: TaskItem[] = [
      {
        id: "t1",
        companyId: "c1",
        parentId: null,
        title: "Task 1",
        description: null,
        status: "completed",
        priority: "normal",
        dueDate: null,
        expectedOutput: null,
        progress: 100,
        assigneeType: "agent",
        assigneeId: "emp-1",
        blockedReason: null,
        requiresHumanApproval: false,
        createdAt: today.toISOString(),
        updatedAt: today.toISOString(),
        metadata: null,
      },
      {
        id: "t2",
        companyId: "c1",
        parentId: null,
        title: "Task 2",
        description: null,
        status: "in_progress",
        priority: "normal",
        dueDate: null,
        expectedOutput: null,
        progress: 50,
        assigneeType: "agent",
        assigneeId: "emp-1",
        blockedReason: null,
        requiresHumanApproval: false,
        createdAt: today.toISOString(),
        updatedAt: today.toISOString(),
        metadata: null,
      },
    ];

    const vm = buildOrgViewModel(tree, [apiAgent("emp-1", "slot-1")], tasks);
    expect(vm.agents[0].todayTasks).toBe(2);
    expect(vm.agents[0].completedTasks).toBe(1);
    expect(vm.agents[0].status).toBe("running");
  });

  it("filters available platform templates by existing slugs", () => {
    const available = getAvailablePlatformTemplates(tree, [
      {
        id: "p1",
        slug: "marketing",
        displayName: "市场部",
        category: "市场",
        icon: null,
        responsibilitySummary: null,
        sortOrder: 1,
      },
      {
        id: "p2",
        slug: "product",
        displayName: "产品部",
        category: "产品",
        icon: null,
        responsibilitySummary: "产品规划",
        sortOrder: 2,
      },
    ]);
    expect(available.map((t) => t.slug)).toEqual(["product"]);
  });
});
