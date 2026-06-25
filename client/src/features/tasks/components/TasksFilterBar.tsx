import { Search, SlidersHorizontal, RotateCcw, List, LayoutGrid, Rows3 } from "lucide-react";
import { ALL_STATUSES, PRIORITY_CONFIG, STATUS_CONFIG } from "../model/constants";
import type { TaskStatus, TaskPriority } from "../api/tasksTypes";

type ProjectOption = { id: string; name: string };

type Props = {
  q: string;
  onQChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  priority: string;
  onPriorityChange: (v: string) => void;
  projectId: string;
  onProjectChange: (v: string) => void;
  projects: ProjectOption[];
  viewMode: "list" | "tree" | "kanban";
  onViewModeChange: (m: "list" | "tree" | "kanban") => void;
};

export default function TasksFilterBar({
  q,
  onQChange,
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  projectId,
  onProjectChange,
  projects,
  viewMode,
  onViewModeChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder="搜索任务标题…"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400" />
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
        >
          <option value="">全部状态</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_CONFIG[s].label}
            </option>
          ))}
        </select>
      </div>

      <select
        value={priority}
        onChange={(e) => onPriorityChange(e.target.value)}
        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
      >
        <option value="">全部优先级</option>
        {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_CONFIG[p].label}
          </option>
        ))}
      </select>

      <select
        value={projectId}
        onChange={(e) => onProjectChange(e.target.value)}
        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
      >
        <option value="">全部项目</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <div className="flex overflow-hidden rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => onViewModeChange("list")}
          title="列表视图"
          className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors ${
            viewMode === "list"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <List className="h-3.5 w-3.5" />
          列表
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("tree")}
          title="树形视图"
          className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors ${
            viewMode === "tree"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <Rows3 className="h-3.5 w-3.5" />
          树形
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("kanban")}
          title="看板视图"
          className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors ${
            viewMode === "kanban"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          看板
        </button>
      </div>

      {(q || status || priority || projectId) && (
        <button
          type="button"
          onClick={() => {
            onQChange("");
            onStatusChange("");
            onPriorityChange("");
            onProjectChange("");
          }}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <RotateCcw className="h-3 w-3" />
          重置
        </button>
      )}
    </div>
  );
}
