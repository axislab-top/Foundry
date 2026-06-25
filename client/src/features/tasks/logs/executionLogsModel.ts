import type { ExecutionLogEntry, TaskRunItem } from "../api/tasksTypes";

export type ExecutionStatus = "success" | "failed" | "running";
export type TriggerType = "auto" | "manual";

export interface ExecutionStep {
  id: string;
  stepNumber: number;
  description: string;
  duration: number;
  inputSummary: string;
  outputSummary: string;
}

export interface ExecutionRecord {
  id: string;
  runId: string;
  agentId: string | null;
  agentName: string;
  agentAvatar: { initials: string; color: string };
  taskId: string | null;
  taskName: string;
  startTime: string;
  duration: number;
  status: ExecutionStatus;
  trigger: TriggerType;
  steps: ExecutionStep[];
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-amber-500",
];

export function agentInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/[\u4e00-\u9fff]/.test(trimmed)) return trimmed.slice(0, 1);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

export function avatarColorForId(id: string | null): string {
  if (!id) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

export function mapRunStatus(status: TaskRunItem["status"]): ExecutionStatus {
  if (status === "succeeded") return "success";
  if (status === "failed") return "failed";
  return "running";
}

export function mapTriggerSource(source: TaskRunItem["triggerSource"]): TriggerType {
  return source === "manual" ? "manual" : "auto";
}

export function runDurationSeconds(run: TaskRunItem): number {
  const start = new Date(run.startedAt).getTime();
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 1000));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickUuid(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (UUID_RE.test(s)) return s;
  }
  return null;
}

function snapUuid(snap: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  if (!snap || typeof snap !== "object") return null;
  for (const k of keys) {
    const hit = pickUuid(snap[k]);
    if (hit) return hit;
  }
  return null;
}

function resolveRunIds(run: TaskRunItem, steps: ExecutionLogEntry[]) {
  const md = run.metadata ?? {};
  let taskId = run.linkedTaskId ?? null;
  let agentId = run.linkedAgentId ?? null;

  for (const log of steps) {
    taskId ??= log.taskId ?? snapUuid(log.outputSnapshot, "taskId", "task_id");
    agentId ??= log.agentId ?? snapUuid(log.outputSnapshot, "agentId", "agent_id");
  }

  taskId ??= pickUuid(md.taskId, md.task_id, md.triggerRef);
  agentId ??= pickUuid(md.agentId, md.agent_id);

  return { taskId, agentId };
}

function resolveTaskLabel(run: TaskRunItem, taskId: string | null, taskTitleById: Map<string, string>): string {
  if (run.linkedTaskTitle?.trim()) return run.linkedTaskTitle.trim();
  if (taskId) {
    return taskTitleById.get(taskId) ?? `任务 ${taskId.slice(0, 8)}`;
  }
  const md = run.metadata ?? {};
  const kind = String(md.kind ?? md.runKind ?? "");
  if (kind === "ceo_heartbeat") return "CEO 心跳巡检";
  if (kind === "autonomous_event") return "自主编排事件";
  if (run.triggerSource === "task_completed") return "任务完成触发";
  if (run.triggerSource === "budget_warning") return "预算预警触发";
  return "系统运行";
}

function resolveAgentLabel(run: TaskRunItem, agentId: string | null, agentNameById: Map<string, string>): string {
  if (agentId) {
    return agentNameById.get(agentId) ?? `Agent ${agentId.slice(0, 8)}`;
  }
  const md = run.metadata ?? {};
  const kind = String(md.kind ?? md.runKind ?? "");
  if (kind === "ceo_heartbeat") return "CEO 编排";
  return "系统";
}

export function logsToSteps(logs: ExecutionLogEntry[]): ExecutionStep[] {
  return logs.map((log, idx) => {
    const snap = log.outputSnapshot;
    const snapKeys =
      snap && typeof snap === "object" ? Object.keys(snap).slice(0, 3).join(", ") : "";
    return {
      id: log.id,
      stepNumber: idx + 1,
      description: log.stepType || log.message || "步骤",
      duration: log.durationMs != null ? Math.round(log.durationMs / 1000) : 0,
      inputSummary: log.traceId ? `trace: ${log.traceId.slice(0, 8)}` : "—",
      outputSummary: log.message?.trim() || snapKeys || "—",
    };
  });
}

export function runToRecord(
  run: TaskRunItem,
  agentNameById: Map<string, string>,
  taskTitleById: Map<string, string>,
  steps: ExecutionLogEntry[] = [],
): ExecutionRecord {
  const { taskId, agentId } = resolveRunIds(run, steps);
  const agentName = resolveAgentLabel(run, agentId, agentNameById);
  const taskName = resolveTaskLabel(run, taskId, taskTitleById);

  return {
    id: run.id.slice(0, 8).toUpperCase(),
    runId: run.id,
    agentId,
    agentName,
    agentAvatar: {
      initials: agentInitials(agentName),
      color: avatarColorForId(agentId),
    },
    taskId,
    taskName,
    startTime: run.startedAt,
    duration: runDurationSeconds(run),
    status: mapRunStatus(run.status),
    trigger: mapTriggerSource(run.triggerSource),
    steps: logsToSteps(steps),
  };
}

export function buildTrendData(runs: TaskRunItem[], days = 7) {
  const data: { day: string; success: number; failed: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = date.toDateString();
    const dayLabel = `${date.getMonth() + 1}/${date.getDate()}`;
    const dayRuns = runs.filter((r) => new Date(r.startedAt).toDateString() === key);
    data.push({
      day: dayLabel,
      success: dayRuns.filter((r) => r.status === "succeeded").length,
      failed: dayRuns.filter((r) => r.status === "failed").length,
    });
  }
  return data;
}

export function buildTodayStats(runs: TaskRunItem[]) {
  const today = new Date().toDateString();
  const todayRuns = runs.filter((r) => new Date(r.startedAt).toDateString() === today);
  const successCount = todayRuns.filter((r) => r.status === "succeeded").length;
  const failedCount = todayRuns.filter((r) => r.status === "failed").length;
  const durations = todayRuns.map(runDurationSeconds);
  const avgDuration =
    durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  return { total: todayRuns.length, success: successCount, failed: failedCount, avgDuration };
}
