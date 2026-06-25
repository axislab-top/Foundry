import { AlertCircle, ChevronRight, Target } from "lucide-react";
import type { TaskSummary } from "./TaskSidebarCard";

const STATUS_LABEL: Record<TaskSummary["status"], string> = {
  not_started: "未开始",
  in_progress: "进行中",
  blocked: "受阻",
  done: "已完成",
};

type Props = {
  tasks: TaskSummary[];
  loading?: boolean;
  onOpenTask: (taskId: string) => void;
  onReportBlocked?: (task: TaskSummary) => void;
};

function pickPrimarySubGoals(tasks: TaskSummary[]): TaskSummary[] {
  const flat: TaskSummary[] = [];
  const walk = (nodes: TaskSummary[]) => {
    for (const n of nodes) {
      flat.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tasks);
  const active = flat.filter((t) => t.status !== "done");
  return (active.length ? active : flat).slice(0, 3);
}

export default function DepartmentSubGoalBar({
  tasks,
  loading,
  onOpenTask,
  onReportBlocked,
}: Props) {
  const primary = pickPrimarySubGoals(tasks);
  const blockedCount = primary.filter((t) => t.status === "blocked").length;

  if (loading) {
    return (
      <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5">
        <div className="h-3 w-40 animate-pulse rounded bg-indigo-100" />
      </div>
    );
  }

  if (!primary.length) return null;

  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-900">
          <Target className="h-3.5 w-3.5" />
          本部门子目标
        </div>
        {blockedCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-100">
            <AlertCircle className="h-3 w-3" />
            {blockedCount} 项受阻
          </span>
        ) : null}
      </div>

      {primary.map((task) => {
        const pct = Math.max(0, Math.min(100, task.progress));
        const barColor =
          task.status === "done"
            ? "bg-emerald-500"
            : task.status === "blocked"
              ? "bg-rose-500"
              : pct >= 50
                ? "bg-blue-500"
                : "bg-amber-400";
        return (
          <button
            key={task.id}
            type="button"
            onClick={() => onOpenTask(task.id)}
            className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-gray-900">{task.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
                  <span>{STATUS_LABEL[task.status] ?? task.status}</span>
                  <span>·</span>
                  <span>{Math.round(pct)}%</span>
                  {task.owner && task.owner !== "待分配" ? (
                    <>
                      <span>·</span>
                      <span>{task.owner}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            {task.status === "blocked" && onReportBlocked ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onReportBlocked(task);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    onReportBlocked(task);
                  }
                }}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-medium text-rose-800 hover:bg-rose-100"
              >
                <AlertCircle className="h-3 w-3" />
                上报主管
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
