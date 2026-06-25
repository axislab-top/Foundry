import { motion } from "framer-motion";
import {
  CircleDollarSign,
  TrendingUp,
  TrendingDown,
  Coins,
  Gauge,
} from "lucide-react";
import type { BillingDashboardSummary } from "../types";
import { formatCredit, formatRmbFromCredit, parseCredit } from "../utils/formatCredit";

type Props = {
  dashboard: BillingDashboardSummary | undefined;
  loading?: boolean;
};

function SummaryCard({
  icon,
  label,
  value,
  sub,
  valueColor = "text-gray-900",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={`mt-2 text-xl font-bold ${valueColor}`}>{value}</p>
      <p className="mt-1 text-[11px] text-gray-400">{sub}</p>
    </motion.div>
  );
}

export default function CostsSummaryCards({ dashboard, loading }: Props) {
  const monthCost = parseCredit(dashboard?.aggregates.monthCost);
  const lastMonthCost = parseCredit(dashboard?.aggregates.lastMonthCost);
  const todayCost = parseCredit(dashboard?.aggregates.todayCost);
  const monthTokens =
    (dashboard?.aggregates.monthInputTokens ?? 0) + (dashboard?.aggregates.monthOutputTokens ?? 0);
  const utilization = dashboard?.budget?.utilization ?? 0;
  const utilizationPct = Math.round(utilization * 100);

  const changePercent =
    lastMonthCost > 0
      ? +(((monthCost - lastMonthCost) / lastMonthCost) * 100).toFixed(1)
      : null;

  if (loading && !dashboard) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        icon={<CircleDollarSign className="h-5 w-5 text-blue-600" />}
        label="本月消费"
        value={formatCredit(monthCost)}
        sub={
          lastMonthCost > 0
            ? `上月 ${formatCredit(lastMonthCost)} · ${formatRmbFromCredit(monthCost)}`
            : formatRmbFromCredit(monthCost)
        }
      />
      <SummaryCard
        icon={
          changePercent != null && changePercent >= 0 ? (
            <TrendingUp className="h-5 w-5 text-red-500" />
          ) : (
            <TrendingDown className="h-5 w-5 text-green-500" />
          )
        }
        label="较上月涨跌"
        value={
          changePercent != null
            ? `${changePercent > 0 ? "+" : ""}${changePercent}%`
            : "—"
        }
        sub={
          changePercent == null
            ? "暂无上月数据"
            : changePercent >= 0
              ? "消费上升"
              : "消费下降"
        }
        valueColor={
          changePercent == null
            ? "text-gray-900"
            : changePercent >= 0
              ? "text-red-600"
              : "text-green-600"
        }
      />
      <SummaryCard
        icon={<Coins className="h-5 w-5 text-amber-600" />}
        label="本月 Token"
        value={`${(monthTokens / 1_000_000).toFixed(2)}M`}
        sub={`输入 ${(dashboard?.aggregates.monthInputTokens ?? 0).toLocaleString()} / 输出 ${(dashboard?.aggregates.monthOutputTokens ?? 0).toLocaleString()}`}
      />
      <SummaryCard
        icon={<Gauge className="h-5 w-5 text-emerald-600" />}
        label="今日消费 / 预算"
        value={formatCredit(todayCost)}
        sub={
          dashboard?.budget
            ? `${formatRmbFromCredit(todayCost)} · 预算已用 ${utilizationPct}%（${formatCredit(parseCredit(dashboard.budget.usedAmount))} / ${formatCredit(parseCredit(dashboard.budget.totalAmount))}）`
            : `${formatRmbFromCredit(todayCost)} · 未设置预算`
        }
      />
    </div>
  );
}
