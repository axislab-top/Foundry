import { deriveAgentWorkStatus } from "../../../client/src/features/office/utils/agentStatus";
import type { TaskItem } from "../../../client/src/features/tasks/api/tasksTypes";

function task(assigneeId: string, status: string): TaskItem {
  return {
    id: `t-${assigneeId}-${status}`,
    title: "x",
    status,
    assigneeType: "agent",
    assigneeId,
  } as TaskItem;
}

describe("deriveAgentWorkStatus", () => {
  it("returns blocked when any assigned task is blocked", () => {
    const status = deriveAgentWorkStatus("a1", [
      task("a1", "completed"),
      task("a1", "blocked"),
    ]);
    expect(status).toBe("blocked");
  });

  it("returns working for active statuses", () => {
    expect(deriveAgentWorkStatus("a1", [task("a1", "in_progress")])).toBe("working");
    expect(deriveAgentWorkStatus("a1", [task("a1", "review")])).toBe("working");
  });

  it("returns idle when no active or blocked tasks", () => {
    expect(deriveAgentWorkStatus("a1", [task("a1", "completed")])).toBe("idle");
    expect(deriveAgentWorkStatus("a1", [])).toBe("idle");
  });
});
