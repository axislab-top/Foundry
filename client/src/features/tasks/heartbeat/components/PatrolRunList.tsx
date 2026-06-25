import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { getExecutionLogsByRunId } from "@/features/tasks/api/tasksApi";
import type { PatrolRunView } from "../heartbeat-types";
import { heartbeatKeys } from "../queryKeys";
import PatrolRunDetail from "./PatrolRunDetail";

const STATUS_LABEL: Record<PatrolRunView["status"], string> = {
  running: "进行中",
  succeeded: "成功",
  failed: "失败",
};

type Props = {
  runs: PatrolRunView[];
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  return `${month}/${day} ${hours}:${mins}`;
}

export default function PatrolRunList({ runs }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
        <p className="text-sm text-gray-600">尚无巡检记录</p>
        <p className="mt-1 text-xs text-gray-400">下一个调度周期将自动运行</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="hidden border-b border-gray-100 bg-[#f8f9fa] px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:grid sm:grid-cols-[88px_minmax(0,1fr)_72px_64px_56px_24px] sm:gap-3">
        <span>时间</span>
        <span>类型</span>
        <span>状态</span>
        <span>耗时</span>
        <span className="text-right">风险</span>
        <span />
      </div>

      <div className="divide-y divide-gray-100">
        {runs.map((run) => {
          const isExpanded = expandedId === run.id;
          return (
            <div key={run.id}>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : run.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 sm:grid sm:grid-cols-[88px_minmax(0,1fr)_72px_64px_56px_24px]"
              >
                <span className="shrink-0 font-mono text-xs text-gray-400">{formatWhen(run.startedAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gray-900">{run.triggerLabel}</span>
                  {run.tier ? (
                    <span className="mt-0.5 block text-[11px] text-gray-400">
                      {run.tier === "cheap" ? "轻量模式" : "完整模式"}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-gray-600">{STATUS_LABEL[run.status]}</span>
                <span className="shrink-0 text-xs text-gray-500">{run.durationLabel ?? "—"}</span>
                <span className="shrink-0 text-right text-xs tabular-nums text-gray-500">
                  {run.riskScore ?? "—"}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {isExpanded ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden border-t border-gray-100 bg-[#fafafa]"
                  >
                    <ExpandedRunDetail runId={run.id} run={run} />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExpandedRunDetail({ runId, run }: { runId: string; run: PatrolRunView }) {
  const logsQuery = useQuery({
    queryKey: heartbeatKeys.runLogs(runId),
    queryFn: () => getExecutionLogsByRunId(runId),
    staleTime: 10_000,
  });

  return (
    <div className="px-4 py-4">
      {run.errorSummary ? (
        <p className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {run.errorSummary}
        </p>
      ) : null}
      {logsQuery.isLoading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          加载步骤…
        </div>
      ) : (
        <PatrolRunDetail logs={logsQuery.data ?? []} />
      )}
      <Link
        to="/tasks/logs"
        className="mt-3 inline-block text-xs text-[#2d5a8e] hover:text-[#1e3a5f]"
      >
        查看全部执行日志 →
      </Link>
    </div>
  );
}
