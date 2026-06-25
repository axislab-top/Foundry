import type { HeartbeatStatCards } from "../heartbeat-types";

type Props = {
  stats: HeartbeatStatCards;
};

function MetricCell({
  label,
  value,
  detail,
  valueClassName = "text-gray-900",
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClassName}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-gray-400">{detail}</p>
    </div>
  );
}

export default function HeartbeatStatCards({ stats }: Props) {
  const successTone =
    stats.todayTotal === 0
      ? "text-gray-400"
      : stats.todaySuccessRate >= 95
        ? "text-gray-900"
        : stats.todaySuccessRate >= 80
          ? "text-amber-700"
          : "text-red-600";

  const failTone = stats.failedLast24h === 0 ? "text-gray-900" : "text-red-600";
  const riskTone =
    stats.latestRiskScore == null
      ? "text-gray-400"
      : stats.latestRiskScore >= 70
        ? "text-red-600"
        : stats.latestRiskScore >= 40
          ? "text-amber-700"
          : "text-gray-900";

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="grid divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        <MetricCell
          label="最近巡检"
          value={stats.runningPatrolCount > 0 ? `${stats.runningPatrolCount} 进行中` : stats.lastPatrolLabel}
          detail={stats.lastPatrolSub}
        />
        <MetricCell
          label="24 小时失败"
          value={String(stats.failedLast24h)}
          detail={stats.failedLast24h === 0 ? "无失败记录" : "建议查看巡检历史"}
          valueClassName={failTone}
        />
        <MetricCell
          label="今日成功率"
          value={stats.todayTotal > 0 ? `${stats.todaySuccessRate}%` : "—"}
          detail={stats.todayTotal > 0 ? `${stats.todaySucceeded} / ${stats.todayTotal} 次` : "今日暂无巡检"}
          valueClassName={successTone}
        />
        <MetricCell
          label="最新风险分"
          value={stats.latestRiskScore != null ? String(stats.latestRiskScore) : "—"}
          detail={stats.latestRiskLevel ? `等级 ${stats.latestRiskLevel}` : "暂无评估"}
          valueClassName={riskTone}
        />
      </div>
    </div>
  );
}
