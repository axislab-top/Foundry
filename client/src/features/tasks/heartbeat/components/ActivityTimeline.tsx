import type { ActivityTimelineItem } from "../heartbeat-types";

const RESULT_LABEL: Record<ActivityTimelineItem["result"], string> = {
  success: "成功",
  failed: "失败",
  warning: "警告",
};

type Props = {
  items: ActivityTimelineItem[];
};

export default function ActivityTimeline({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-400">暂无最近活动</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <ul className="divide-y divide-gray-100">
        {items.map((event) => (
          <li key={event.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="shrink-0 font-mono text-[11px] text-gray-400">{event.time}</span>
              <span className="shrink-0 text-[11px] text-gray-500">{RESULT_LABEL[event.result]}</span>
            </div>
            <p className="mt-1 text-xs font-medium text-gray-800">{event.agent}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{event.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
