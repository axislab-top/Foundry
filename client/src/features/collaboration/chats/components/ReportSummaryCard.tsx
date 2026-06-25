import { MessageSquareReply, ExternalLink } from "lucide-react";
import type { ReportSummaryRichCard } from "@contracts/types/collaboration-2026";

export default function ReportSummaryCard({
  card,
  onFocusTask,
}: {
  card: ReportSummaryRichCard;
  onFocusTask?: (taskId: string) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/50 text-left shadow-sm">
      <div className="flex items-center gap-2 border-b border-indigo-100 px-3 py-2">
        <MessageSquareReply className="h-4 w-4 text-indigo-700" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-gray-900">部门汇总回报</div>
          <div className="truncate text-[10px] text-indigo-700/80">{card.title}</div>
        </div>
        {typeof card.progress === "number" ? (
          <span className="shrink-0 text-[10px] font-medium text-indigo-800">{card.progress}%</span>
        ) : null}
      </div>
      <div className="space-y-2 px-3 py-3">
        <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-gray-800">{card.summary}</p>
        <button
          type="button"
          onClick={() => onFocusTask?.(card.taskId)}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-indigo-800 hover:bg-indigo-50"
        >
          <ExternalLink className="h-3 w-3" />
          查看关联任务
        </button>
      </div>
    </div>
  );
}
