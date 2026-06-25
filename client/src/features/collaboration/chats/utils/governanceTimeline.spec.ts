import { buildGovernanceTimelineEntries } from "./governanceTimeline";

describe("governanceTimeline dispatch observability", () => {
  it("includes dispatch ack and progress entries", () => {
    const entries = buildGovernanceTimelineEntries([
      {
        id: "d1",
        createdAt: "2026-06-15T10:00:00.000Z",
        content: "派活给产品部",
        metadata: {
          kind: "main_room_dispatch_item",
          richCard: {
            cardType: "main_room_dispatch_item",
            taskId: "sg-1",
            subGoalTaskId: "sg-1",
            title: "新品调研",
            deptLabel: "产品部",
            status: "pending_ack",
          },
        },
      },
      {
        id: "a1",
        createdAt: "2026-06-15T10:01:00.000Z",
        content: "已接单",
        metadata: { kind: "main_room_director_ack", subGoalTaskId: "sg-1" },
      },
      {
        id: "p1",
        createdAt: "2026-06-15T10:05:00.000Z",
        content: "产品部 进展：初稿完成",
        metadata: { kind: "main_room_dept_progress_relay", departmentLabel: "产品部", parentGoalTaskId: "pg-1" },
      },
    ]);
    expect(entries.map((e) => e.kind)).toEqual(["dispatch", "ack", "progress"]);
  });

  it("includes deliverable and digest entries from rich cards", () => {
    const entries = buildGovernanceTimelineEntries([
      {
        id: "del1",
        createdAt: "2026-06-15T11:00:00.000Z",
        content: "交付完成",
        metadata: {
          richCard: {
            cardType: "employee_deliverable",
            taskId: "task-1",
            department: "marketing",
            artifacts: [{ type: "markdown", label: "选题清单" }],
          },
        },
      },
      {
        id: "dig1",
        createdAt: "2026-06-15T11:30:00.000Z",
        content: "汇总",
        metadata: {
          richCard: {
            cardType: "supervision_deliverable_digest",
            parentGoalTaskId: "pg-1",
            departments: [{ slug: "marketing", label: "市场部", status: "completed" }],
          },
        },
      },
    ]);
    expect(entries.map((e) => e.kind)).toEqual(["deliverable", "digest"]);
  });
});
