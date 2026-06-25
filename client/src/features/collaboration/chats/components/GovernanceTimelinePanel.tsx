import { useMemo } from "react";
import { CheckCircle2, Layers, Link2, MessageSquareReply, Send, ThumbsUp, Package, FileText } from "lucide-react";
import type { GovernanceTimelineEntry } from "../utils/governanceTimeline.types";

export type { GovernanceTimelineEntry } from "../utils/governanceTimeline.types";

const KIND_CFG: Record<
  GovernanceTimelineEntry["kind"],
  { icon: typeof Layers; label: string; cls: string }
> = {
  wave: { icon: Layers, label: "阶段推进", cls: "text-sky-700 bg-sky-50 border-sky-100" },
  completion: { icon: CheckCircle2, label: "编排结案", cls: "text-emerald-700 bg-emerald-50 border-emerald-100" },
  report: { icon: MessageSquareReply, label: "部门回报", cls: "text-indigo-700 bg-indigo-50 border-indigo-100" },
  coordination: { icon: Link2, label: "跨部门协调", cls: "text-amber-700 bg-amber-50 border-amber-100" },
  dispatch: { icon: Send, label: "部门派活", cls: "text-violet-700 bg-violet-50 border-violet-100" },
  ack: { icon: ThumbsUp, label: "主管接单", cls: "text-teal-700 bg-teal-50 border-teal-100" },
  progress: { icon: Layers, label: "部门进展", cls: "text-blue-700 bg-blue-50 border-blue-100" },
  deliverable: { icon: Package, label: "员工交付", cls: "text-emerald-700 bg-emerald-50 border-emerald-100" },
  digest: { icon: FileText, label: "交付汇总", cls: "text-slate-700 bg-slate-50 border-slate-100" },
};

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function GovernanceTimelinePanel({
  entries,
  onFocusTask,
}: {
  entries: GovernanceTimelineEntry[];
  onFocusTask?: (taskId: string) => void;
}) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 12),
    [entries],
  );

  if (!sorted.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-semibold text-slate-900">治理时间线</div>
      <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
        波次推进、结案与回报事件按时间倒序汇总。
      </p>
      <ol className="mt-2.5 space-y-2">
        {sorted.map((entry) => {
          const cfg = KIND_CFG[entry.kind];
          if (!cfg) return null;
          const Icon = cfg.icon;
          return (
            <li
              key={entry.id}
              className={`rounded-lg border px-2.5 py-2 ${cfg.cls.split(" ").slice(2).join(" ")}`}
            >
              <div className="flex items-start gap-2">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cfg.cls.split(" ")[0]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-medium ${cfg.cls.split(" ")[0]}`}>{cfg.label}</span>
                    <span className="shrink-0 text-[9px] text-gray-400">{formatShortTime(entry.at)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-gray-900">{entry.title}</p>
                  {entry.detail ? (
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-gray-600">{entry.detail}</p>
                  ) : null}
                  {entry.taskId && onFocusTask ? (
                    <button
                      type="button"
                      onClick={() => onFocusTask(entry.taskId!)}
                      className="mt-1 text-[10px] font-medium text-gray-700 hover:underline"
                    >
                      查看任务
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
