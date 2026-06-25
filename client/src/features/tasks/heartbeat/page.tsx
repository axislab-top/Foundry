import { useCallback, useMemo } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import HeartbeatStatusBanner from "./components/HeartbeatStatusBanner";
import HeartbeatStatCards from "./components/HeartbeatStatCards";
import HeartbeatConfigPanel from "./components/HeartbeatConfigPanel";
import PatrolRunList from "./components/PatrolRunList";
import ActivityTimeline from "./components/ActivityTimeline";
import LoadWarningsBanner from "./components/LoadWarningsBanner";
import { useHeartbeatDashboard } from "./useHeartbeatDashboard";
import { useHeartbeatRealtime } from "./useHeartbeatRealtime";

function LoadingSkeleton() {
  return (
    <section className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded bg-gray-100" />
        <div className="h-4 w-72 rounded bg-gray-100" />
      </div>
      <div className="h-24 rounded-xl bg-gray-100" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="h-64 rounded-xl bg-gray-100" />
        <div className="h-48 rounded-xl bg-gray-100" />
      </div>
    </section>
  );
}

function LatestSummary({
  text,
  sourceLabel,
}: {
  text: string;
  sourceLabel: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="border-l-2 border-[#1e3a5f] pl-4">
        <p className="text-xs font-medium text-gray-500">巡检摘要</p>
        <p className="mt-0.5 text-[11px] text-gray-400">{sourceLabel}</p>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{text}</p>
      </div>
    </div>
  );
}

export default function HeartbeatPage() {
  const { data, isLoading, isError, refetch, isFetching } = useHeartbeatDashboard();
  useHeartbeatRealtime();

  const lastUpdated = useMemo(() => {
    if (!data?.generatedAt) return "—";
    const d = new Date(data.generatedAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }, [data?.generatedAt]);

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError || !data) {
    return (
      <section className="flex flex-col items-center justify-center gap-4 rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <AlertCircle className="h-8 w-8 text-gray-400" />
        <div>
          <p className="text-sm font-medium text-gray-800">加载失败</p>
          <p className="mt-1 text-xs text-gray-500">请确认已登录且 API 服务可用</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          重试
        </button>
      </section>
    );
  }

  return (
    <section className="h-full space-y-6 overflow-auto p-4 md:p-6">
      <HeartbeatStatusBanner
        status={data.statusBanner}
        lastUpdated={lastUpdated}
        refreshing={isFetching}
        onRefresh={handleRefresh}
      />

      <LoadWarningsBanner warnings={data.loadWarnings} />

      <HeartbeatStatCards stats={data.stats} />

      {data.latestSummary ? (
        <LatestSummary text={data.latestSummary.text} sourceLabel={data.latestSummary.sourceLabel} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900">巡检历史</h2>
            <span className="text-xs text-gray-400">{data.patrolRuns.length} 条记录</span>
          </div>
          <PatrolRunList runs={data.patrolRuns} />
        </div>

        <aside className="space-y-4">
          <HeartbeatConfigPanel />
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">最近活动</h2>
            <ActivityTimeline items={data.activityTimeline} />
          </div>
        </aside>
      </div>
    </section>
  );
}
