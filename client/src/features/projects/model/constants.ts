import type { ProjectStatus } from "../api/projectsTypes";

export const STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
  active: { label: "进行中", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  paused: { label: "暂停", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  completed: { label: "已完成", color: "text-green-700", bg: "bg-green-50 border-green-200" },
};

export const ALL_STATUSES: ProjectStatus[] = ["active", "paused", "completed"];

export const TASK_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  in_progress: { label: "进行中", color: "text-blue-600" },
  pending: { label: "待处理", color: "text-gray-500" },
  queued: { label: "排队中", color: "text-gray-500" },
  completed: { label: "已完成", color: "text-green-600" },
  blocked: { label: "阻塞", color: "text-red-600" },
  review: { label: "复核中", color: "text-purple-600" },
};

export const drawerVariants = {
  hidden: { x: "100%", opacity: 0 },
  visible: { x: 0, opacity: 1 },
  exit: { x: "100%", opacity: 0 },
};

export const drawerTransition = { duration: 0.2, ease: "easeInOut" as const };

export function formatProjectDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}
