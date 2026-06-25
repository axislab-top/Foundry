import { useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Layers } from "lucide-react";
import type { CeoV2ExecutionRibbonModel } from "../utils/ceoV2Metadata";
import { describeExecutionSemanticsForUser } from "../utils/ceoV2Metadata";

/**
 * 群聊内：CEO v2 公司化执行进度条（DAG / 波次 / 门闸摘要）。
 * 与后端 `metadata.source === 'ceo_v2'` + executionSemantics / ceoExecutionPlanSummary 对齐。
 */
export default function CeoV2ExecutionStatusCard({
  model,
  compact = false,
}: {
  model: CeoV2ExecutionRibbonModel;
  /** 侧栏用更紧凑排版 */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!model.show) return null;

  const sem = model.executionSemantics;
  const badge =
    sem === "sequential_waves"
      ? "顺序推进"
      : sem === "parallel_waves"
        ? "并行波次"
        : model.semanticsLabel || "执行中";

  const badgeCls =
    sem === "sequential_waves"
      ? "border-indigo-200 bg-indigo-50 text-indigo-900"
      : sem === "parallel_waves"
        ? "border-violet-200 bg-violet-50 text-violet-900"
        : "border-slate-200 bg-slate-50 text-slate-800";

  return (
    <div
      className={`rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/90 via-white to-white text-left shadow-sm ${
        compact ? "mt-0" : "mt-2"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-indigo-100/80 px-3 py-2">
        <Layers className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
        <span className={`text-[11px] font-semibold ${compact ? "text-indigo-950" : "text-indigo-950"}`}>
          主编排执行进度
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeCls}`}
        >
          {badge}
        </span>
        {model.provisional ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900">
            更新中…
          </span>
        ) : null}
      </div>

      <div className={`space-y-2 px-3 py-2 ${compact ? "text-[10px]" : "text-[11px]"}`}>
        {sem ? (
          <p className="leading-snug text-slate-700">{describeExecutionSemanticsForUser(sem)}</p>
        ) : null}

        {model.ceoExecutionPlanSummary ? (
          <div className="flex gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5">
            <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-snug text-slate-800">
              {model.ceoExecutionPlanSummary}
            </p>
          </div>
        ) : null}

        {!compact && typeof model.distributionCount === "number" ? (
          <div className="text-[10px] text-slate-500">本计划部门任务数：{model.distributionCount}</div>
        ) : null}

        {(model.workflowId || model.traceId || model.planningSummary) && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex w-full items-center gap-1 text-left text-[10px] font-medium text-indigo-700 hover:text-indigo-900"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            调试信息（链路 ID）
          </button>
        )}

        {open ? (
          <dl className="space-y-1 rounded-lg border border-slate-100 bg-white px-2 py-1.5 font-mono text-[9px] text-slate-600">
            {model.workflowId ? (
              <div className="break-all">
                <dt className="inline text-slate-400">workflow </dt>
                <dd className="inline">{model.workflowId}</dd>
              </div>
            ) : null}
            {model.traceId ? (
              <div className="break-all">
                <dt className="inline text-slate-400">trace </dt>
                <dd className="inline">{model.traceId}</dd>
              </div>
            ) : null}
            {model.planningSummary ? (
              <div className="break-all whitespace-pre-wrap">
                <dt className="block text-slate-400">planning </dt>
                <dd>{model.planningSummary}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </div>
  );
}
