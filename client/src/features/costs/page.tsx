import { CalendarDays } from "lucide-react";
import CostsSummaryCards from "./components/CostsSummaryCards";
import CostsCharts from "./components/CostsCharts";
import CostsDetailTable from "./components/CostsDetailTable";
import CostsDetailDrawer from "./components/CostsDetailDrawer";
import { useCostsPage } from "./hooks/useCostsPage";
import type { TimeRange } from "./types";
import { BILLING_CREDIT_RATE_HINT, formatRelativeAggregatedAt } from "./utils/formatCredit";

const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "quarter", label: "最近 3 个月" },
];

export default function CostsPage() {
  const {
    timeRange,
    setTimeRange,
    agentFilter,
    setAgentFilter,
    page,
    setPage,
    detailTarget,
    closeDetail,
    handleViewDetail,
    dashboard,
    dashboardLoading,
    trend,
    chartRows,
    chartsLoading,
    tableRows,
    tableTotal,
    tableLoading,
    agents,
  } = useCostsPage();

  const utilizationPct = dashboard?.budget
    ? Math.round((dashboard.budget.utilization ?? 0) * 100)
    : null;

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">AI 成本追踪</h2>
            <p className="mt-0.5 text-xs text-gray-500">AI Cost Tracking · {BILLING_CREDIT_RATE_HINT}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            {utilizationPct != null ? (
              <span
                className={`rounded-md px-2 py-0.5 font-medium ${
                  utilizationPct > 90
                    ? "bg-red-50 text-red-700"
                    : utilizationPct > 70
                      ? "bg-amber-50 text-amber-700"
                      : "bg-green-50 text-green-700"
                }`}
              >
                预算 {utilizationPct}%
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatRelativeAggregatedAt(dashboard?.agentUsageRealtime.lastAggregatedAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="shrink-0">
        <CostsSummaryCards dashboard={dashboard} loading={dashboardLoading} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {TIME_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setTimeRange(opt.key)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              timeRange === opt.key
                ? "bg-[#1e3a5f] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="shrink-0">
        <CostsCharts
          agentDailyRows={chartRows}
          trend={trend}
          loading={chartsLoading}
        />
      </div>

      <CostsDetailTable
        rows={tableRows}
        total={tableTotal}
        page={page}
        onPageChange={setPage}
        agentFilter={agentFilter}
        onAgentFilterChange={setAgentFilter}
        agents={agents}
        loading={tableLoading}
        onViewDetail={handleViewDetail}
      />

      <CostsDetailDrawer target={detailTarget} onClose={closeDetail} />
    </section>
  );
}
