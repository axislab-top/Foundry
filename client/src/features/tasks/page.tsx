import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { listProjects } from "@/features/projects/api/projectsApi";
import { projectKeys } from "@/features/projects/api/queryKeys";
import TasksStatsBar from "./components/TasksStatsBar";
import TasksFilterBar from "./components/TasksFilterBar";
import TaskListTable from "./components/TaskListTable";
import TaskDetailDrawer from "./components/TaskDetailDrawer";
import TaskKanbanBoard from "./components/TaskKanbanBoard";
import TaskCreateDrawer from "./components/TaskCreateDrawer";
import { createTask, listTasks, updateTaskStatus } from "./api/tasksApi";
import type { TaskItem, TaskStats, TaskPriority } from "./api/tasksTypes";
import { isOverdue } from "./model/constants";
import { getColumnIdForStatus, getPrimaryStatusForColumn } from "./model/kanban";
import type { KanbanColumnId } from "./components/TaskKanbanBoard";
import { extractApiError } from "@/shared/api/extractApiError";

function buildTree(tasks: TaskItem[]): TaskItem[] {
  const map = new Map<string, TaskItem>();
  const roots: TaskItem[] = [];

  for (const t of tasks) map.set(t.id, { ...t, children: [] });
  for (const t of tasks) {
    const node = map.get(t.id)!;
    if (t.parentId && map.has(t.parentId)) {
      map.get(t.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function computeStats(items: TaskItem[]): TaskStats {
  const total = items.length;
  const inProgress = items.filter((t) => t.status === "in_progress").length;
  const completed = items.filter((t) => t.status === "completed").length;
  const blocked = items.filter((t) => t.status === "blocked").length;
  const pending = items.filter((t) => ["pending", "queued"].includes(t.status)).length;
  const overdue = items.filter((t) => isOverdue(t)).length;
  return { total, inProgress, completed, blocked, pending, overdue };
}

export default function TasksCenterPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlProjectId = searchParams.get("projectId") ?? "";

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [projectId, setProjectId] = useState(urlProjectId);
  const [viewMode, setViewMode] = useState<"list" | "tree" | "kanban">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    if (urlProjectId) setProjectId(urlProjectId);
  }, [urlProjectId]);

  const projectsQuery = useQuery({
    queryKey: projectKeys.list({ pageSize: 100 }),
    queryFn: () => listProjects({ pageSize: 100 }),
    staleTime: 60_000,
  });

  const projectOptions = useMemo(
    () => (projectsQuery.data?.items ?? []).map((p) => ({ id: p.id, name: p.name })),
    [projectsQuery.data],
  );

  const tasksQuery = useQuery({
    queryKey: ["tasks-center", { status, priority, projectId, viewMode }],
    queryFn: () =>
      listTasks({
        pageSize: 100,
        status: status || undefined,
        priority: priority || undefined,
        projectId: projectId || undefined,
        rootOnly: viewMode === "tree",
      }),
    staleTime: 10_000,
  });

  const allItems = useMemo(() => tasksQuery.data?.items ?? [], [tasksQuery.data]);

  const filteredItems = useMemo(() => {
    if (!q.trim()) return allItems;
    const lower = q.trim().toLowerCase();
    return allItems.filter((t) => t.title.toLowerCase().includes(lower));
  }, [allItems, q]);

  const displayItems = useMemo(() => {
    if (viewMode === "tree") return buildTree(filteredItems);
    return filteredItems;
  }, [filteredItems, viewMode]);

  const stats = useMemo(() => computeStats(allItems), [allItems]);

  const selectedTask = useMemo(
    () => filteredItems.find((t) => t.id === selectedId) ?? null,
    [filteredItems, selectedId],
  );

  useEffect(() => {
    if (selectedId && !filteredItems.find((t) => t.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, filteredItems]);

  const handleProjectChange = useCallback(
    (id: string) => {
      setProjectId(id);
      if (id) {
        setSearchParams({ projectId: id });
      } else {
        setSearchParams({});
      }
    },
    [setSearchParams],
  );

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks-center"] });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      setShowCreateDrawer(false);
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({
      taskId,
      targetColumnId,
      currentTask,
    }: {
      taskId: string;
      targetColumnId: KanbanColumnId;
      currentTask: TaskItem;
    }) => {
      const nextStatus = getPrimaryStatusForColumn(targetColumnId);
      const progress =
        nextStatus === "completed" && currentTask.progress < 100
          ? 100
          : nextStatus === "pending" && currentTask.status === "completed"
            ? Math.min(currentTask.progress, 99)
            : undefined;
      return updateTaskStatus(taskId, nextStatus, progress);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks-center"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks-board"] });
    },
    onError: (error) => {
      setMoveError(extractApiError(error, "状态更新失败"));
    },
  });

  const handleKanbanMove = useCallback(
    (taskId: string, targetColumnId: KanbanColumnId) => {
      const currentTask = filteredItems.find((t) => t.id === taskId);
      if (!currentTask) return;
      if (getColumnIdForStatus(currentTask.status) === targetColumnId) return;
      moveMutation.mutate({ taskId, targetColumnId, currentTask });
    },
    [filteredItems, moveMutation],
  );

  const handleKanbanSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleCreateSubmit = (data: {
    title: string;
    priority: TaskPriority;
    projectId: string;
    dueDate: string;
  }) => {
    createMutation.mutate({
      title: data.title,
      priority: data.priority,
      projectId: data.projectId || undefined,
      dueDate: data.dueDate || undefined,
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 md:p-6">
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">任务中心</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              全局任务视图 — 跟踪 AI Agent 的任务分配、执行进度与阻塞情况
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCreateDrawer(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e]"
            >
              <Plus className="h-4 w-4" />
              新建任务
            </button>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              实时同步
            </div>
          </div>
        </div>
      </div>

      <TasksStatsBar stats={stats} loading={tasksQuery.isLoading} />

      <TasksFilterBar
        q={q}
        onQChange={setQ}
        status={status}
        onStatusChange={setStatus}
        priority={priority}
        onPriorityChange={setPriority}
        projectId={projectId}
        onProjectChange={handleProjectChange}
        projects={projectOptions}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {viewMode === "kanban" ? (
        <>
          {moveError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{moveError}</div>
          ) : null}
          <TaskKanbanBoard
            items={filteredItems}
            onSelect={handleKanbanSelect}
            onMoveTask={handleKanbanMove}
            movingTaskId={moveMutation.isPending ? moveMutation.variables?.taskId ?? null : null}
          />
        </>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <TaskListTable
            items={displayItems}
            loading={tasksQuery.isLoading}
            selectedId={selectedId}
            onSelect={setSelectedId}
            viewMode={viewMode}
          />
          <div className="hidden lg:block">
            {selectedTask ? (
              <TaskDetailDrawer task={selectedTask} onClose={() => setSelectedId(null)} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                  <svg className="h-7 w-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="mt-3 text-sm font-medium text-gray-500">选择一个任务</p>
                <p className="mt-1 text-xs text-gray-400">点击左侧任务查看详细信息</p>
              </div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showCreateDrawer && (
          <TaskCreateDrawer
            projects={projectOptions}
            initialProjectId={projectId}
            submitting={createMutation.isPending}
            onSubmit={handleCreateSubmit}
            onClose={() => setShowCreateDrawer(false)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
