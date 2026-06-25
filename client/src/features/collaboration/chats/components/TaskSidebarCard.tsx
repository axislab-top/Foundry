import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Target, UserRound, Trash2, CheckCircle2, AlertCircle, Loader2, Circle } from "lucide-react";

export type TaskSummary = {
  id: string;
  title: string;
  owner: string;
  progress: number;
  status: "not_started" | "in_progress" | "blocked" | "done";
  children?: TaskSummary[];
};

const STATUS_CFG = {
  not_started: { label: "未开始", icon: Circle, cls: "bg-gray-100 text-gray-600" },
  in_progress: { label: "进行中", icon: Loader2, cls: "bg-blue-50 text-blue-700" },
  blocked: { label: "受阻", icon: AlertCircle, cls: "bg-rose-50 text-rose-700" },
  done: { label: "已完成", icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700" },
};

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v >= 100 ? "bg-emerald-500" : v >= 50 ? "bg-blue-500" : "bg-amber-400";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${v}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}

const SingleTaskRow = memo(function SingleTaskRow({
  task,
  depth = 0,
  deletingId,
  onDelete,
  onOpenTask,
  highlightedTaskId,
}: {
  task: TaskSummary;
  depth?: number;
  deletingId: string | null;
  onDelete: (task: TaskSummary) => void;
  onOpenTask?: (taskId: string) => void;
  highlightedTaskId?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = !!task.children?.length;
  const cfg = STATUS_CFG[task.status] ?? STATUS_CFG.not_started;
  const StatusIcon = cfg.icon;
  const isDeleting = deletingId === task.id;

  return (
    <div className={`${isDeleting ? "opacity-50" : ""}`}>
      <div
        id={`task-row-${task.id}`}
        role={onOpenTask ? "button" : undefined}
        tabIndex={onOpenTask ? 0 : undefined}
        onClick={onOpenTask ? () => onOpenTask(task.id) : undefined}
        onKeyDown={
          onOpenTask
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenTask(task.id);
                }
              }
            : undefined
        }
        className={`group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors ${
          onOpenTask ? "cursor-pointer hover:bg-gray-50" : "hover:bg-gray-50"
        } ${depth > 0 ? "ml-4 border-l-2 border-gray-100" : ""} ${
          highlightedTaskId === task.id ? "ring-2 ring-blue-400/80 bg-blue-50/60" : ""
        }`}
      >
        {/* Expand/collapse */}
        <button
          type="button"
          onClick={() => hasChildren && setExpanded(!expanded)}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-gray-300"
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : (
            <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
          )}
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-medium text-gray-800">{task.title}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-medium ${cfg.cls}`}>
              <StatusIcon className="h-2.5 w-2.5" />
              {cfg.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <UserRound className="h-2.5 w-2.5" />
              {task.owner || "待分配"}
            </span>
            <div className="flex-1">
              <ProgressBar value={task.progress} />
            </div>
            <span className="text-[10px] font-medium text-gray-500">{Math.round(task.progress)}%</span>
          </div>
        </div>

        {/* Delete */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task);
          }}
          disabled={Boolean(deletingId)}
          className="mt-0.5 hidden h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-500 group-hover:flex disabled:opacity-40"
          title="删除任务"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {task.children!.map((child) => (
              <SingleTaskRow
                key={child.id}
                task={child}
                depth={depth + 1}
                deletingId={deletingId}
                onDelete={onDelete}
                onOpenTask={onOpenTask}
                highlightedTaskId={highlightedTaskId}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default memo(function TaskSidebarCard({
  tasks,
  loading,
  deletingId,
  onDelete,
  onOpenTask,
  highlightedTaskId,
}: {
  tasks: TaskSummary[];
  loading?: boolean;
  deletingId: string | null;
  onDelete: (task: TaskSummary) => void;
  onOpenTask?: (taskId: string) => void;
  highlightedTaskId?: string | null;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">任务概要</span>
        {!loading && tasks.length > 0 && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {tasks.length} 项
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />
              <div className="h-2 w-full animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center py-4">
          <Target className="h-6 w-6 text-gray-300" />
          <p className="mt-1.5 text-[11px] text-gray-400">暂无任务</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {tasks.map((task) => (
            <SingleTaskRow
              key={task.id}
              task={task}
              deletingId={deletingId}
              onDelete={onDelete}
              onOpenTask={onOpenTask}
              highlightedTaskId={highlightedTaskId}
            />
          ))}
        </div>
      )}
    </div>
  );
});
