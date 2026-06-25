import { ClipboardList } from "lucide-react";
import type { ProcessingStatusView } from "../utils/replayMetadata";

export default function ReplayProcessingStatusChip({ status }: { status: ProcessingStatusView }) {
  if (status.stage !== "execution_intake") return null;
  const label =
    status.status === "ready_to_create"
      ? "任务候选已就绪"
      : status.status === "awaiting_confirmation"
        ? "任务候选待确认"
        : status.status === "needs_clarification"
          ? "任务候选需补充"
          : "任务入口处理中";

  return (
    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
      <ClipboardList className="h-3 w-3 text-slate-500" />
      <span>{label}</span>
    </div>
  );
}
