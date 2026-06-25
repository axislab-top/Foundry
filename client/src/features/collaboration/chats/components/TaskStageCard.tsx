import { ListTodo } from "lucide-react";
import type { TaskStageRichCard } from "@contracts/types/collaboration-2026";
import { EXECUTION_PROGRAM_STAGE_LABELS } from "@contracts/types/orchestration-lifecycle";

const STATUS_LABEL: Record<string, string> = {
  pending: "待开始",
  in_progress: "进行中",
  completed: "已完成",
  blocked: "受阻",
  cancelled: "已取消",
};

export default function TaskStageCard({ card }: { card: TaskStageRichCard }) {
  const statusKey = String(card.status ?? "pending").toLowerCase();
  const statusLabel = STATUS_LABEL[statusKey] ?? card.status ?? "—";
  const stageKey = String(card.stage ?? "").trim() as keyof typeof EXECUTION_PROGRAM_STAGE_LABELS;
  const stageLabel =
    stageKey && stageKey in EXECUTION_PROGRAM_STAGE_LABELS
      ? EXECUTION_PROGRAM_STAGE_LABELS[stageKey]
      : card.stage;

  return (
    <div className="mt-2 rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] text-left shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#e5e7eb] px-3 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#2d5a8e]/10 text-[#2d5a8e]">
          <ListTodo className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-gray-900">任务阶段</div>
          <div className="text-[10px] text-gray-500">{stageLabel}</div>
        </div>
        <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#1e3a5f] ring-1 ring-[#e5e7eb]">
          {statusLabel}
        </span>
      </div>
      <div className="space-y-2 px-3 py-3">
        <p className="text-[13px] font-medium leading-relaxed text-gray-900">{card.title}</p>
        {typeof card.progress === "number" ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-[#e5e7eb]">
            <div
              className="h-full rounded-full bg-[#3b82f6]"
              style={{ width: `${Math.max(0, Math.min(100, card.progress))}%` }}
            />
          </div>
        ) : null}
        {card.summary ? <p className="text-[12px] text-gray-600">{card.summary}</p> : null}
      </div>
    </div>
  );
}
