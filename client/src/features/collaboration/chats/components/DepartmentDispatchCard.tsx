import { Building2, Calendar, ExternalLink, ListChecks } from "lucide-react";
import type { DepartmentDispatchRichCard } from "@contracts/types/collaboration-2026";

const STATUS_LABEL: Record<string, string> = {
  pending: "待开始",
  in_progress: "进行中",
  completed: "已完成",
  blocked: "受阻",
  cancelled: "已取消",
};

export default function DepartmentDispatchCard({
  card,
  onFocusTask,
  onOpenTask,
}: {
  card: DepartmentDispatchRichCard;
  onFocusTask?: (taskId: string) => void;
  onOpenTask?: (taskId: string) => void;
}) {
  const statusKey = String(card.status ?? "pending").toLowerCase();
  const statusLabel = STATUS_LABEL[statusKey] ?? card.status ?? "—";
  const dueHint =
    card.dueAt && !Number.isNaN(new Date(card.dueAt).getTime())
      ? new Date(card.dueAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
      : null;

  return (
    <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/40 text-left shadow-sm">
      <div className="flex items-center gap-2 border-b border-indigo-100 px-3 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-700">
          <Building2 className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-gray-900">部门子目标</div>
          <div className="text-[10px] text-indigo-700/80">主群已确认分工</div>
        </div>
        <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800 ring-1 ring-indigo-100">
          {statusLabel}
        </span>
      </div>

      <div className="space-y-3 px-3 py-3">
        <p className="text-[13px] font-medium leading-relaxed text-gray-900">{card.title}</p>

        {dueHint ? (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>截止 {dueHint}</span>
          </div>
        ) : null}

        {card.acceptanceCriteria && card.acceptanceCriteria.length > 0 ? (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              <ListChecks className="h-3 w-3" />
              验收要点
            </div>
            <ul className="list-inside list-disc space-y-0.5 text-[12px] text-gray-700">
              {card.acceptanceCriteria.slice(0, 6).map((c, i) => (
                <li key={i} className="break-words">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {onOpenTask ? (
            <button
              type="button"
              onClick={() => onOpenTask(card.taskId)}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-700"
            >
              <ExternalLink className="h-3 w-3" />
              打开任务详情
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onFocusTask?.(card.taskId)}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-indigo-800 hover:bg-indigo-50"
          >
            <ExternalLink className="h-3 w-3" />
            在任务树中定位
          </button>
        </div>
      </div>
    </div>
  );
}
