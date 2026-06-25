import type { SchedulePageStats } from "../schedulesModel";

type Props = { stats: SchedulePageStats };

function MetricCell({
  label,
  value,
  detail,
  valueClassName = "text-gray-900",
}: {
  label: string;
  value: string | number;
  detail?: string;
  valueClassName?: string;
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClassName}`}>{value}</p>
      {detail ? <p className="mt-0.5 text-[11px] text-gray-400">{detail}</p> : null}
    </div>
  );
}

export default function ScheduleStatCards({ stats }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="grid divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        <MetricCell label="启用规则" value={stats.enabledCount} detail="当前生效的定时任务" />
        <MetricCell label="今日已运行" value={stats.todayRuns} detail="按上次运行时间统计" />
        <MetricCell
          label="最近失败"
          value={stats.failedCount}
          detail={stats.failedCount === 0 ? "无失败记录" : "建议检查对应规则"}
          valueClassName={stats.failedCount === 0 ? "text-gray-900" : "text-red-600"}
        />
        <MetricCell label="最近下次运行" value={stats.nextRunLabel} valueClassName="text-base leading-snug" />
      </div>
    </div>
  );
}
