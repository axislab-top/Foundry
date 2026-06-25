import { Link } from "react-router-dom";
import type { ScheduledPlaybookViewModel } from "../schedules-types";
import { formatNextRunLabel, formatScheduleSummary } from "../schedules-types";

type Props = {
  item: ScheduledPlaybookViewModel | null;
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-3 last:border-0">
      <dt className="shrink-0 text-xs text-gray-500">{label}</dt>
      <dd className="text-right text-sm text-gray-800">{value}</dd>
    </div>
  );
}

export default function ScheduleDetailPanel({ item }: Props) {
  if (!item) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-xs text-gray-400">选择一条规则查看详情</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="border-b border-gray-100 pb-4">
        <h3 className="text-sm font-semibold text-gray-900">{item.name}</h3>
        <p className="mt-1 text-xs text-gray-500">{item.enabled ? "已启用" : "已暂停"}</p>
      </div>
      <dl className="mt-1">
        <DetailRow label="周期" value={formatScheduleSummary(item)} />
        <DetailRow label="时区" value={item.timezone} />
        <DetailRow label="执行 Agent" value={item.assigneeAgentName ?? item.assigneeAgentId} />
        <DetailRow label="下次运行" value={formatNextRunLabel(item.nextRunAt)} />
        <DetailRow label="上次运行" value={formatNextRunLabel(item.lastRunAt)} />
        {item.description ? <DetailRow label="说明" value={item.description} /> : null}
        {item.lastTaskId ? (
          <DetailRow
            label="最近任务"
            value={
              <Link to="/tasks/center" className="text-[#2d5a8e] hover:text-[#1e3a5f]">
                任务中心
              </Link>
            }
          />
        ) : null}
      </dl>
    </div>
  );
}
