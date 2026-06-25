import type { TaskStatus } from "../api/tasksTypes";

export type KanbanColumnId = "pending" | "in_progress" | "awaiting_approval" | "completed";

export interface KanbanColumn {
  id: KanbanColumnId;
  title: string;
  titleEn: string;
  color: string;
  borderColor: string;
  statuses: TaskStatus[];
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: "pending",
    title: "待处理",
    titleEn: "Pending",
    color: "bg-gray-50",
    borderColor: "border-gray-300",
    statuses: ["pending", "queued"],
  },
  {
    id: "in_progress",
    title: "进行中",
    titleEn: "In Progress",
    color: "bg-blue-50",
    borderColor: "border-blue-300",
    statuses: ["in_progress", "review", "paused"],
  },
  {
    id: "awaiting_approval",
    title: "待审批",
    titleEn: "Awaiting Approval",
    color: "bg-amber-50",
    borderColor: "border-amber-300",
    statuses: ["awaiting_approval", "blocked"],
  },
  {
    id: "completed",
    title: "已完成",
    titleEn: "Completed",
    color: "bg-green-50",
    borderColor: "border-green-300",
    statuses: ["completed", "cancelled"],
  },
];

/** 拖拽到列时写入的主状态（列内其它状态归并到此值） */
export const KANBAN_COLUMN_PRIMARY_STATUS: Record<KanbanColumnId, TaskStatus> = {
  pending: "pending",
  in_progress: "in_progress",
  awaiting_approval: "awaiting_approval",
  completed: "completed",
};

export function getColumnIdForStatus(status: TaskStatus): KanbanColumnId {
  for (const col of KANBAN_COLUMNS) {
    if (col.statuses.includes(status)) return col.id;
  }
  return "pending";
}

export function getPrimaryStatusForColumn(columnId: KanbanColumnId): TaskStatus {
  return KANBAN_COLUMN_PRIMARY_STATUS[columnId];
}
