import { RefreshCw } from "lucide-react";
import type { HeartbeatStatusBanner } from "../heartbeat-types";

type Props = {
  status: HeartbeatStatusBanner;
  lastUpdated: string;
  refreshing: boolean;
  onRefresh: () => void;
};

const DOT_CLASS: Record<HeartbeatStatusBanner["level"], string> = {
  normal: "bg-emerald-500",
  running: "bg-[#3b82f6]",
  degraded: "bg-amber-500",
  failed: "bg-red-500",
};

export default function HeartbeatStatusBanner({ status, lastUpdated, refreshing, onRefresh }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">自治 Heartbeat</h1>
        <p className="mt-1 text-sm text-gray-500">CEO 定时巡检与 pending 任务扫描</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
          <span className="inline-flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${DOT_CLASS[status.level]}`} />
            <span className="font-medium text-gray-800">{status.label}</span>
          </span>
          <span className="hidden text-gray-300 sm:inline">·</span>
          <span className="text-xs text-gray-400">更新于 {lastUpdated}</span>
          {status.hint ? (
            <>
              <span className="hidden text-gray-300 sm:inline">·</span>
              <span className="text-xs text-gray-500">{status.hint}</span>
            </>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        刷新
      </button>
    </div>
  );
}
