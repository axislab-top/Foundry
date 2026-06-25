import type { TaskStatus, TaskPriority } from "../api/tasksTypes";

export const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; dotClass: string; bgClass: string; textClass: string; borderClass: string }
> = {
  pending: {
    label: "待启动",
    dotClass: "bg-slate-400",
    bgClass: "bg-slate-50",
    textClass: "text-slate-600",
    borderClass: "border-slate-200",
  },
  queued: {
    label: "排队中",
    dotClass: "bg-slate-300",
    bgClass: "bg-slate-50",
    textClass: "text-slate-500",
    borderClass: "border-slate-200",
  },
  in_progress: {
    label: "进行中",
    dotClass: "bg-sky-500",
    bgClass: "bg-sky-50",
    textClass: "text-sky-700",
    borderClass: "border-sky-200",
  },
  review: {
    label: "评审中",
    dotClass: "bg-violet-500",
    bgClass: "bg-violet-50",
    textClass: "text-violet-700",
    borderClass: "border-violet-200",
  },
  awaiting_approval: {
    label: "待审批",
    dotClass: "bg-amber-500",
    bgClass: "bg-amber-50",
    textClass: "text-amber-700",
    borderClass: "border-amber-200",
  },
  completed: {
    label: "已完成",
    dotClass: "bg-emerald-500",
    bgClass: "bg-emerald-50",
    textClass: "text-emerald-700",
    borderClass: "border-emerald-200",
  },
  blocked: {
    label: "阻塞",
    dotClass: "bg-rose-500",
    bgClass: "bg-rose-50",
    textClass: "text-rose-700",
    borderClass: "border-rose-200",
  },
  cancelled: {
    label: "已取消",
    dotClass: "bg-gray-300",
    bgClass: "bg-gray-50",
    textClass: "text-gray-500",
    borderClass: "border-gray-200",
  },
  paused: {
    label: "已暂停",
    dotClass: "bg-orange-400",
    bgClass: "bg-orange-50",
    textClass: "text-orange-700",
    borderClass: "border-orange-200",
  },
};

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; dotClass: string }> = {
  low: { label: "低", dotClass: "bg-slate-300" },
  normal: { label: "普通", dotClass: "bg-sky-400" },
  high: { label: "高", dotClass: "bg-amber-500" },
  urgent: { label: "紧急", dotClass: "bg-rose-500" },
};

export const ALL_STATUSES: TaskStatus[] = [
  "pending",
  "queued",
  "in_progress",
  "review",
  "awaiting_approval",
  "completed",
  "blocked",
  "cancelled",
  "paused",
];

export const ACTIVE_STATUSES: TaskStatus[] = [
  "pending",
  "queued",
  "in_progress",
  "review",
  "awaiting_approval",
  "blocked",
  "paused",
];

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function isOverdue(task: { dueDate: string | null; status: TaskStatus }): boolean {
  if (!task.dueDate) return false;
  if (["completed", "cancelled"].includes(task.status)) return false;
  return new Date(task.dueDate).getTime() < Date.now();
}
