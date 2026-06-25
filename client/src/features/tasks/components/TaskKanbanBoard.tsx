import { useCallback, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GripVertical, Calendar, Bot } from "lucide-react";
import type { TaskItem } from "../api/tasksTypes";
import { PRIORITY_CONFIG, isOverdue } from "../model/constants";
import {
  KANBAN_COLUMNS,
  getColumnIdForStatus,
  type KanbanColumn,
  type KanbanColumnId,
} from "../model/kanban";

function KanbanTaskCard({
  task,
  onDragStart,
  onDragEnd,
  onSelect,
}: {
  task: TaskItem;
  onDragStart: (taskId: string) => void;
  onDragEnd: (taskId: string, event: MouseEvent | PointerEvent | TouchEvent, info: { point: { x: number; y: number } }) => void;
  onSelect: (id: string) => void;
}) {
  const pCfg = PRIORITY_CONFIG[task.priority];
  const overdue = isOverdue(task);
  const assigneeLabel = task.assigneeName ?? (task.assigneeId ? task.assigneeId.slice(0, 8) : "未分配");
  const assigneeInitial = (task.assigneeName ?? task.assigneeId ?? "?").trim().charAt(0).toUpperCase();

  return (
    <motion.div
      layout
      layoutId={task.id}
      drag
      dragSnapToOrigin
      dragElastic={0.1}
      onDragStart={() => onDragStart(task.id)}
      onDragEnd={(event, info) => onDragEnd(task.id, event, info)}
      whileDrag={{ scale: 1.03, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 50 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      onClick={() => onSelect(task.id)}
      className="cursor-grab rounded-lg border border-gray-200 bg-white p-3 shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug text-gray-800">{task.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {pCfg && (
              <span className={`inline-block h-2 w-2 rounded-full ${pCfg.dotClass}`} title={pCfg.label} />
            )}
            {task.projectName && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">{task.projectName}</span>
            )}
            <span className="inline-flex items-center gap-1 rounded bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500">
              <Bot className="h-2.5 w-2.5" />
              {assigneeLabel}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            {task.dueDate ? (
              <span className={`inline-flex items-center gap-1 text-[10px] ${overdue ? "font-medium text-orange-500" : "text-gray-400"}`}>
                <Calendar className="h-2.5 w-2.5" />
                {new Date(task.dueDate).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
              </span>
            ) : (
              <span />
            )}
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">
              {assigneeInitial}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function KanbanColumnView({
  column,
  tasks,
  onDragStart,
  onDragEnd,
  onSelect,
  columnRef,
}: {
  column: KanbanColumn;
  tasks: TaskItem[];
  onDragStart: (taskId: string) => void;
  onDragEnd: (taskId: string, event: MouseEvent | PointerEvent | TouchEvent, info: { point: { x: number; y: number } }) => void;
  onSelect: (id: string) => void;
  columnRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={columnRef}
      data-column-id={column.id}
      className={`flex min-h-[400px] flex-col rounded-xl border ${column.borderColor} ${column.color}`}
    >
      <div className="flex items-center justify-between border-b border-gray-200/60 px-4 py-3">
        <div>
          <h4 className="text-[13px] font-semibold text-gray-800">{column.title}</h4>
          <p className="text-[10px] text-gray-400">{column.titleEn}</p>
        </div>
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-semibold text-gray-600 shadow-sm">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => (
            <KanbanTaskCard
              key={task.id}
              task={task}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onSelect={onSelect}
            />
          ))}
        </AnimatePresence>
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[12px] text-gray-400">暂无任务</div>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  items: TaskItem[];
  onSelect: (id: string) => void;
  onMoveTask?: (taskId: string, targetColumnId: KanbanColumnId) => void | Promise<void>;
  movingTaskId?: string | null;
};

export default function TaskKanbanBoard({ items, onSelect, onMoveTask, movingTaskId }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const columnRefs = useRef<Map<KanbanColumnId, HTMLDivElement>>(new Map());

  const setColumnRef = useCallback((columnId: KanbanColumnId) => (el: HTMLDivElement | null) => {
    if (el) columnRefs.current.set(columnId, el);
    else columnRefs.current.delete(columnId);
  }, []);

  const tasksByColumn = useMemo(() => {
    const map: Record<KanbanColumnId, TaskItem[]> = { pending: [], in_progress: [], awaiting_approval: [], completed: [] };
    for (const task of items) {
      const colId = getColumnIdForStatus(task.status);
      map[colId].push(task);
    }
    return map;
  }, [items]);

  const detectTargetColumn = useCallback((point: { x: number; y: number }): KanbanColumnId | null => {
    for (const [colId, el] of columnRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
        return colId;
      }
    }
    return null;
  }, []);

  const handleDragStart = useCallback((taskId: string) => {
    setDraggingId(taskId);
  }, []);

  const handleDragEnd = useCallback(
    (taskId: string, _event: MouseEvent | PointerEvent | TouchEvent, info: { point: { x: number; y: number } }) => {
      setDraggingId(null);
      const targetColumnId = detectTargetColumn(info.point);
      if (!targetColumnId || !onMoveTask) return;

      const task = items.find((t) => t.id === taskId);
      if (!task) return;
      if (getColumnIdForStatus(task.status) === targetColumnId) return;

      void onMoveTask(taskId, targetColumnId);
    },
    [detectTargetColumn, items, onMoveTask],
  );

  const busyId = movingTaskId ?? draggingId;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {KANBAN_COLUMNS.map((column) => (
        <KanbanColumnView
          key={column.id}
          column={column}
          tasks={tasksByColumn[column.id]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onSelect={onSelect}
          columnRef={setColumnRef(column.id)}
        />
      ))}
      {busyId ? (
        <div className="pointer-events-none fixed bottom-6 right-6 rounded-lg bg-[#1e3a5f] px-3 py-2 text-xs text-white shadow-lg">
          更新任务状态…
        </div>
      ) : null}
    </div>
  );
}

export type { KanbanColumnId };
