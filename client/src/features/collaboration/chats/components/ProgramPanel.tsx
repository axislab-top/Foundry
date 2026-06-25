import { CheckCircle2, Loader2 } from "lucide-react";
import type { CollaborationProgramView } from "../utils/programLifecycle";
import {
  briefFieldRows,
  goalUnderstandingAspectRows,
  programPhaseDisplayLabel,
} from "../utils/programLifecycle";

export default function ProgramPanel({
  program,
  sending,
  onConfirmExecution,
}: {
  program: CollaborationProgramView | null | undefined;
  sending?: boolean;
  onConfirmExecution?: () => void;
}) {
  if (!program) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-3 py-2.5 text-[10px] text-gray-500">
        发起交付型任务（如报告、方案）后，将在此显示 Program 进度。
      </div>
    );
  }

  const phase = String(program.phase ?? "").trim();
  const rows = briefFieldRows(program);
  const aspectRows = goalUnderstandingAspectRows(program);
  const goalSummary = String(program.goalUnderstanding?.summary ?? "").trim();
  const readiness = program.goalUnderstanding?.readiness;
  const completeness = Math.round((program.brief?.completeness ?? 0) * 100);
  const awaitingConfirm =
    phase === "pending_confirm" ||
    (goalSummary &&
      readiness === "ready" &&
      ["aligning", "intake", "ready_to_plan", "pending_confirm"].includes(phase));
  const executing = phase === "dept_executing" || phase === "dispatching" || phase === "supervising";
  const needsClarification = readiness === "needs_clarification";

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-b from-indigo-50/80 to-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-indigo-950">交付 Program</div>
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] text-indigo-800">
          {executing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          {programPhaseDisplayLabel(program)}
        </span>
      </div>

      {goalSummary ? (
        <div className="mt-2 rounded-lg border border-indigo-100 bg-white/80 px-2 py-1.5 text-[10px] text-gray-800">
          <div className="text-[9px] font-medium text-indigo-700">目标理解</div>
          <div className="mt-0.5 leading-relaxed">{goalSummary}</div>
          {readiness ? (
            <div className="mt-1 text-[9px] text-gray-500">
              就绪状态：{readiness === "ready" ? "可编排" : "待澄清"}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 text-[11px] font-medium text-gray-900">
          {program.brief?.title ?? program.brief?.deliverableType ?? "交付任务"}
        </div>
      )}

      {needsClarification && program.goalUnderstanding?.clarifyQuestion ? (
        <div className="mt-2 text-[10px] text-amber-800">{program.goalUnderstanding.clarifyQuestion}</div>
      ) : null}

      {aspectRows.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[10px] text-gray-600">
          {aspectRows.map((row) => (
            <li key={row.key}>
              <span className="text-gray-500">{row.key}：</span>
              {row.value}
            </li>
          ))}
        </ul>
      ) : rows.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[10px] text-gray-600">
          {rows.map((row) => (
            <li key={row.key}>
              <span className="text-gray-500">{row.key}：</span>
              {row.value}
            </li>
          ))}
        </ul>
      ) : null}

      {!executing && !goalSummary ? (
        <div className="mt-2 text-[10px] text-gray-500">参数完整度 {completeness}%</div>
      ) : null}

      {awaitingConfirm && onConfirmExecution ? (
        <button
          type="button"
          disabled={sending}
          onClick={onConfirmExecution}
          className="mt-2 w-full rounded-lg border border-emerald-400 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          确认执行
        </button>
      ) : null}
    </div>
  );
}
