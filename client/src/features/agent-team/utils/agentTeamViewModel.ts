import type { TaskItem } from "@/features/tasks/api/tasksTypes";
import {
  countAgentTasks,
  deriveAgentWorkStatus,
  type AgentWorkStatus,
} from "@/features/organization/utils/agentStatus";
import { flattenOrgTree } from "@/features/organization/utils/orgTree";
import type { ApiAgent, OrgTreeNode } from "@/features/organization/types/api";
import type { AgentTeamCard, AgentTeamStatus } from "../types";
import { formatRelativeTime } from "./formatRelativeTime";

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-amber-500",
];

const ROLE_LABELS: Record<string, { zh: string; en: string }> = {
  ceo: { zh: "CEO", en: "Chief Executive Officer" },
  director: { zh: "部门主管", en: "Director" },
  board_member: { zh: "董事会成员", en: "Board Member" },
  executor: { zh: "执行 Agent", en: "Executor" },
};

const OPEN_TASK_STATUSES = new Set([
  "pending",
  "queued",
  "in_progress",
  "review",
  "awaiting_approval",
  "awaiting_supervision",
  "blocked",
  "paused",
]);

function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0];
}

function resolveAvatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "A";
  return trimmed.charAt(0).toUpperCase();
}

function resolveRoleLabels(agent: ApiAgent): { role: string; roleEn: string } {
  const preset = ROLE_LABELS[agent.role];
  const expertise = agent.expertise?.trim();
  if (agent.role === "executor" && expertise) {
    return { role: expertise, roleEn: preset?.en ?? "Executor" };
  }
  if (agent.role === "director" && expertise) {
    return { role: expertise, roleEn: preset?.en ?? "Director" };
  }
  return {
    role: preset?.zh ?? agent.role,
    roleEn: preset?.en ?? agent.role,
  };
}

export function toAgentTeamUiStatus(
  workStatus: AgentWorkStatus,
  agentStatus?: string,
): AgentTeamStatus {
  if (agentStatus === "suspended" || agentStatus === "inactive") return "error";
  if (workStatus === "blocked") return "error";
  if (workStatus === "working") return "running";
  return "idle";
}

function countOpenTasks(agentId: string, tasks: TaskItem[]): number {
  return tasks.filter(
    (task) =>
      task.assigneeType === "agent" &&
      task.assigneeId === agentId &&
      OPEN_TASK_STATUSES.has(task.status),
  ).length;
}

function resolveLastActiveAt(agent: ApiAgent, tasks: TaskItem[]): string | null {
  const mine = tasks.filter((task) => task.assigneeType === "agent" && task.assigneeId === agent.id);
  const latestTaskMs = mine.reduce((max, task) => {
    const ts = new Date(task.updatedAt).getTime();
    return Number.isFinite(ts) ? Math.max(max, ts) : max;
  }, 0);
  const agentMs = agent.updatedAt ? new Date(agent.updatedAt).getTime() : 0;
  const bestMs = Math.max(latestTaskMs, Number.isFinite(agentMs) ? agentMs : 0);
  return bestMs > 0 ? new Date(bestMs).toISOString() : null;
}

function resolveNodeName(tree: OrgTreeNode[], nodeId: string | null): string | null {
  if (!nodeId) return null;
  const node = flattenOrgTree(tree).find((item) => item.id === nodeId);
  return node?.name?.trim() || null;
}

function resolveDescription(agent: ApiAgent): string {
  const expertise = agent.expertise?.trim();
  if (expertise) return expertise;
  const meta = agent.metadata;
  if (meta && typeof meta.description === "string" && meta.description.trim()) {
    return meta.description.trim();
  }
  const labels = resolveRoleLabels(agent);
  return `${labels.role} · ${labels.roleEn}`;
}

export function buildAgentTeamCards(
  apiAgents: ApiAgent[],
  orgTree: OrgTreeNode[],
  tasks: TaskItem[],
): AgentTeamCard[] {
  return apiAgents.map((agent) => {
    const workStatus = deriveAgentWorkStatus(agent.id, tasks);
    const taskCounts = countAgentTasks(agent.id, tasks);
    const roleLabels = resolveRoleLabels(agent);
    const lastActiveAt = resolveLastActiveAt(agent, tasks);

    return {
      id: agent.id,
      name: agent.name,
      role: roleLabels.role,
      roleEn: roleLabels.roleEn,
      status: toAgentTeamUiStatus(workStatus, agent.status),
      avatar: {
        initials: resolveAvatarInitials(agent.name),
        color: pickAvatarColor(agent.id),
      },
      executionsToday: taskCounts.completedTasks,
      taskCount: countOpenTasks(agent.id, tasks),
      lastActiveAt,
      lastActiveLabel: formatRelativeTime(lastActiveAt),
      description: resolveDescription(agent),
      departmentName: resolveNodeName(orgTree, agent.organizationNodeId),
      apiStatus: agent.status,
    };
  });
}
