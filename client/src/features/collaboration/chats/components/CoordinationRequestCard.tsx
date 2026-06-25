import { Link2, ExternalLink } from "lucide-react";
import type { CoordinationRequestRichCard } from "@contracts/types/collaboration-2026";

export default function CoordinationRequestCard({
  card,
  onFocusTask,
}: {
  card: CoordinationRequestRichCard;
  onFocusTask?: (taskId: string) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 text-left shadow-sm">
      <div className="flex items-center gap-2 border-b border-amber-100 px-3 py-2">
        <Link2 className="h-4 w-4 text-amber-700" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-gray-900">跨部门协调请求</div>
          <div className="truncate text-[10px] text-amber-800/90">{card.title}</div>
        </div>
      </div>
      <div className="space-y-2 px-3 py-3">
        <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-gray-800">{card.request}</p>
        {card.neededBy ? (
          <p className="text-[11px] text-gray-600">
            期望时间：<span className="text-gray-800">{card.neededBy}</span>
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => onFocusTask?.(card.taskId)}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-amber-900 hover:bg-amber-50"
        >
          <ExternalLink className="h-3 w-3" />
          查看关联任务
        </button>
      </div>
    </div>
  );
}
