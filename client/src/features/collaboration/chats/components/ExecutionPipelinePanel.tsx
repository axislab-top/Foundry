import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Circle, Loader2, SkipForward, XCircle } from "lucide-react";
import type { OrchestrationRunSnapshot } from "./MessageProcessingChip";
import type { TaskSummary } from "./TaskSidebarCard";
import {
  computeSubGoalDispatchStats,
  parsePhases,
  type PipelinePhaseSnapshot,
  type SubGoalDispatchStats,
} from "../utils/orchestrationPhases";
import { isOrchestrationProgramComplete, resolveOrchestrationLifecycle } from "../utils/collaborationLifecycle";

function PhaseIcon({ status }: { status: PipelinePhaseSnapshot["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />;
    case "done":
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />;
    case "skipped":
      return <SkipForward className="h-3.5 w-3.5 shrink-0 text-gray-400" />;
    default:
      return <Circle className="h-3.5 w-3.5 shrink-0 text-gray-300" />;
  }
}

function DispatchProgressBar({ stats }: { stats: SubGoalDispatchStats }) {
  if (stats.total <= 0) return null;
  const pct = Math.round(((stats.done + stats.blocked * 0.5) / stats.total) * 100);
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 40 ? "bg-blue-500" : "bg-amber-400";
  return (
    <div className="mt-2 space-y-1.5">
      <DispatchStatsLabel stats={stats} />
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DispatchStatsLabel({ stats }: { stats: SubGoalDispatchStats }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-gray-600">
      <span>部门子任务</span>
      <span>
        {stats.done}/{stats.total} 完成
        {stats.inProgress > 0 ? ` · ${stats.inProgress} 进行中` : ""}
        {stats.blocked > 0 ? ` · ${stats.blocked} 受阻` : ""}
      </span>
    </div>
  );
}

export default function ExecutionPipelinePanel({
  run,
  roomKind,
  goalTasks,
  showEmptyHint = false,
}: {
  run: OrchestrationRunSnapshot | null | undefined;
  roomKind: "main" | "department" | string | undefined;
  goalTasks: TaskSummary[];
  showEmptyHint?: boolean;
}) {
  const phases = useMemo(() => parsePhases(run?.metadata ?? null), [run?.metadata]);
  const dispatchStats = useMemo(() => computeSubGoalDispatchStats(goalTasks), [goalTasks]);
  const lifecycle = resolveOrchestrationLifecycle(run);
  const failed = lifecycle === "failed";
  const programComplete = isOrchestrationProgramComplete(run);
  const deptExecuting = lifecycle === "dept_executing";

  if (!run) {
    if (!showEmptyHint) return null;
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-3 py-2.5 text-[10px] text-gray-500">
        等待处理：发布任务后将在此显示执行流水线。
      </div>
    );
  }

  if (!phases.length && !failed) return null;

  return (
    <div
      className={`rounded-xl border p-3 shadow-sm ${
        failed
          ? "border-rose-200 bg-gradient-to-b from-rose-50 to-white"
          : "border-slate-200 bg-gradient-to-b from-slate-50/90 to-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={`text-[11px] font-semibold ${failed ? "text-rose-900" : "text-slate-900"}`}>执行流水线</div>
        {roomKind === "department" ? (
          <span className="rounded-full border border-slate-200 bg-white px-1.5 py-px text-[9px] text-slate-600">部门</span>
        ) : null}
      </div>

      <ol className="mt-2.5 space-y-1.5">
        {phases.map((phase) => (
          <li key={phase.id} className="flex items-start gap-2">
            <PhaseIcon status={phase.status} />
            <span
              className={`text-[11px] leading-snug ${
                phase.status === "running"
                  ? "font-medium text-blue-900"
                  : phase.status === "failed"
                    ? "font-medium text-rose-800"
                    : phase.status === "done"
                      ? "text-gray-700"
                      : "text-gray-500"
              }`}
            >
              {phase.label}
            </span>
          </li>
        ))}
      </ol>

      {dispatchStats.total > 0 ? <DispatchProgressBar stats={dispatchStats} /> : null}

      {failed && run.errorMessage ? (
        <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-rose-700">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          {run.errorMessage.slice(0, 240)}
        </p>
      ) : null}

      {programComplete && roomKind === "main" ? (
        <p className="mt-2 text-[10px] leading-snug text-gray-500">
          部门完成后请负责人在任务中心发起「主群汇总回报」。
        </p>
      ) : null}
      {deptExecuting && roomKind === "main" && dispatchStats.total > 0 ? (
        <p className="mt-2 text-[10px] leading-snug text-gray-500">
          计划已下发，部门正在执行中。进展见上方子任务进度。
        </p>
      ) : null}
    </div>
  );
}
