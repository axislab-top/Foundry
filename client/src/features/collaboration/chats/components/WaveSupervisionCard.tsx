import { ArrowRight, Layers } from "lucide-react";
import { slugDisplayLabel } from "../utils/dispatchPlanDependencies";

export default function WaveSupervisionCard({
  waveDepartments,
  parentGoalTaskId,
  triggerCompletedTaskId,
  summary,
  onFocusTask,
}: {
  waveDepartments?: string[];
  parentGoalTaskId?: string | null;
  triggerCompletedTaskId?: string | null;
  summary?: string;
  onFocusTask?: (taskId: string) => void;
}) {
  const slugs = (waveDepartments ?? []).filter(Boolean).slice(0, 12);
  const triggerShort = triggerCompletedTaskId
    ? triggerCompletedTaskId.length > 10
      ? `${triggerCompletedTaskId.slice(0, 8)}…`
      : triggerCompletedTaskId
    : null;

  return (
    <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50/60 text-left shadow-sm">
      <div className="flex items-center gap-2 border-b border-sky-100 px-3 py-2">
        <Layers className="h-4 w-4 text-sky-700" />
        <span className="text-[13px] font-semibold text-sky-950">编排监督 · 阶段推进</span>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        {triggerShort ? (
          <p className="text-[11px] text-gray-600">
            上一阶段子目标已完成
            <span className="font-mono text-gray-800"> ({triggerShort})</span>
          </p>
        ) : null}
        {slugs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-gray-500">本波解锁</span>
            {slugs.map((slug) => (
              <span
                key={slug}
                className="inline-flex items-center gap-0.5 rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-medium text-sky-900"
              >
                {slugDisplayLabel(slug)}
              </span>
            ))}
            <ArrowRight className="h-3 w-3 text-sky-500" aria-hidden />
            <span className="text-[10px] text-sky-800">自动派发</span>
          </div>
        ) : null}
        {summary ? (
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-gray-700">{summary}</p>
        ) : null}
        {parentGoalTaskId && onFocusTask ? (
          <button
            type="button"
            onClick={() => onFocusTask(parentGoalTaskId)}
            className="text-[10px] font-medium text-sky-800 hover:underline"
          >
            查看主目标进度
          </button>
        ) : null}
      </div>
    </div>
  );
}
