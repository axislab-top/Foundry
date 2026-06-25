import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronDown,
  Clock,
  Bot,
  Building2,
  User,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { TaskItem } from "../api/tasksTypes";
import { STATUS_CONFIG, PRIORITY_CONFIG, relativeTime, isOverdue } from "../model/constants";
import TaskProgressRing from "./TaskProgressRing";

type Props = {
  items: TaskItem[];
  loading?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  viewMode: "list" | "tree";
};

function AssigneeIcon({ type }: { type: string }) {
  if (type === "agent") return <Bot className="h-3.5 w-3.5 text-violet-500" />;
  if (type === "organization_node") return <Building2 className="h-3.5 w-3.5 text-blue-500" />;
  return <User className="h-3.5 w-3.5 text-gray-400" />;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cfg.bgClass} ${cfg.textClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
      {cfg.label}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG];
  if (!cfg) return null;
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${cfg.dotClass}`} title={cfg.label} />
  );
}

/* 树形层级背景色 */
const TREE_DEPTH_BG = [
  "bg-white",
  "bg-blue-50/40",
  "bg-indigo-50/40",
  "bg-violet-50/40",
];

/* 树形层级左侧色条 */
const TREE_DEPTH_BAR = [
  "",
  "border-l-blue-300",
  "border-l-indigo-300",
  "border-l-violet-300",
];

function TaskRow({
  task,
  depth = 0,
  selectedId,
  onSelect,
  viewMode,
  projectName,
}: {
  task: TaskItem;
  depth?: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  viewMode: "list" | "tree";
  projectName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = viewMode === "tree" && (task.children?.length ?? 0) > 0;
  const isSelected = selectedId === task.id;
  const overdue = isOverdue(task);

  const isTree = viewMode === "tree";
  const depthBg = isTree ? TREE_DEPTH_BG[Math.min(depth, TREE_DEPTH_BG.length - 1)] : "";
  const depthBar = isTree && depth > 0 ? TREE_DEPTH_BAR[Math.min(depth, TREE_DEPTH_BAR.length - 1)] : "";

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => onSelect(task.id)}
        className={`group relative flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 ${
          isSelected ? "bg-blue-50/60" : depthBg
        } ${isTree && depth > 0 ? "border-l-2" : ""} ${depthBar}`}
        style={{ paddingLeft: isTree ? `${depth * 32 + 16}px` : "16px" }}
      >
        {/* Status left bar (仅列表模式或顶层) */}
        {(!isTree || depth === 0) && (
          <div
            className={`absolute left-0 top-0 h-full w-[3px] rounded-r ${
              STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG]?.dotClass ?? "bg-gray-300"
            } ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
          />
        )}

        {/* Expand/collapse for tree view */}
        {isTree && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) setExpanded(!expanded);
            }}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
              hasChildren
                ? "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800"
                : "text-gray-300"
            }`}
          >
            {hasChildren ? (
              expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
            )}
          </button>
        )}

        {/* Priority indicator */}
        <PriorityDot priority={task.priority} />

        {/* Title */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`truncate text-sm ${hasChildren ? "font-semibold text-gray-900" : "font-medium"} ${isSelected ? "text-blue-900" : ""}`}>
              {task.title}
            </p>
            {hasChildren && (
              <span className="shrink-0 rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                {task.children!.length} 子任务
              </span>
            )}
            {projectName && (
              <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">{projectName}</span>
            )}
            {overdue && (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orange-500" />
            )}
            {task.status === "completed" && (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <AssigneeIcon type={task.assigneeType} />
              {task.assigneeId ? task.assigneeId.slice(0, 8) : "未分配"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {relativeTime(task.updatedAt)}
            </span>
            {task.dueDate && (
              <span className={overdue ? "text-orange-500 font-medium" : ""}>
                截止 {new Date(task.dueDate).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        </div>

        {/* Status */}
        <StatusBadge status={task.status} />

        {/* Progress ring */}
        <TaskProgressRing value={task.progress} size={32} />

        {/* ID */}
        <span className="hidden w-20 truncate text-right font-mono text-[10px] text-gray-300 lg:block">
          {task.id.slice(0, 8)}
        </span>
      </motion.div>

      {/* Children (tree mode) */}
      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {task.children!.map((child) => (
              <TaskRow
                key={child.id}
                task={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                viewMode={viewMode}
                projectName={child.projectName ?? undefined}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TaskListTable({ items, loading, selectedId, onSelect, viewMode }: Props) {
  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
        <p className="mt-3 text-sm text-gray-500">加载任务列表中…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-20">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
          <CheckCircle2 className="h-8 w-8 text-gray-400" />
        </div>
        <p className="mt-4 text-sm font-medium text-gray-700">暂无任务</p>
        <p className="mt-1 text-xs text-gray-400">当前筛选条件下没有匹配的任务</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Table header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-gray-400 backdrop-blur-sm">
        {viewMode === "tree" && <span className="w-6" />}
        <span className="w-2" />
        <span className="flex-1">任务标题</span>
        <span className="w-20 text-center">状态</span>
        <span className="w-10 text-center">进度</span>
        <span className="hidden w-20 text-right lg:block">ID</span>
      </div>

      {/* Task rows */}
      {items.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          selectedId={selectedId}
          onSelect={onSelect}
          viewMode={viewMode}
          projectName={task.projectName ?? undefined}
        />
      ))}
    </div>
  );
}
