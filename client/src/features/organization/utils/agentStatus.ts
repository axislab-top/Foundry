import type { TaskItem } from "@/features/tasks/api/tasksTypes";

export type AgentWorkStatus = "idle" | "working" | "blocked";

const ACTIVE_STATUSES = new Set([
  "in_progress",
  "review",
  "awaiting_approval",
  "awaiting_supervision",
  "paused",
  "queued",
]);

export function deriveAgentWorkStatus(agentId: string, tasks: TaskItem[]): AgentWorkStatus {
  const mine = tasks.filter((t) => t.assigneeType === "agent" && t.assigneeId === agentId);
  if (mine.some((t) => t.status === "blocked")) return "blocked";
  if (mine.some((t) => ACTIVE_STATUSES.has(t.status))) return "working";
  return "idle";
}

export function toUiAgentStatus(workStatus: AgentWorkStatus): "running" | "idle" {
  return workStatus === "working" ? "running" : "idle";
}

export function countAgentTasks(agentId: string, tasks: TaskItem[]) {
  const mine = tasks.filter((t) => t.assigneeType === "agent" && t.assigneeId === agentId);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const todayTasks = mine.filter((t) => new Date(t.updatedAt).getTime() >= todayMs);
  const completedTasks = todayTasks.filter((t) => t.status === "completed");
  return { todayTasks: todayTasks.length, completedTasks: completedTasks.length };
}
