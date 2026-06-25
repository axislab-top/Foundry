import { AlertTriangle } from "lucide-react";
import type { TaskSummary } from "./TaskSidebarCard";

type Props = {
  tasks: TaskSummary[];
  onPick: (task: TaskSummary) => void;
  sending?: boolean;
};

function collectBlocked(tasks: TaskSummary[]): TaskSummary[] {
  const out: TaskSummary[] = [];
  const walk = (nodes: TaskSummary[]) => {
    for (const n of nodes) {
      if (n.status === "blocked") out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tasks);
  return out.slice(0, 3);
}

export default function BlockedEscalationChips({ tasks, onPick, sending }: Props) {
  const blocked = collectBlocked(tasks);
  if (!blocked.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-gray-500">快捷上报</span>
      {blocked.map((task) => (
        <button
          key={task.id}
          type="button"
          disabled={sending}
          onClick={() => onPick(task)}
          className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{task.title}</span>
        </button>
      ))}
    </div>
  );
}
