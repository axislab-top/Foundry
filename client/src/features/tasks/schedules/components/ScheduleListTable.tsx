import type { ScheduledPlaybookViewModel } from "../schedules-types";
import { formatNextRunLabel, formatScheduleSummary } from "../schedules-types";

type Props = {
  items: ScheduledPlaybookViewModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleEnabled: (item: ScheduledPlaybookViewModel, enabled: boolean) => void;
  onEdit: (item: ScheduledPlaybookViewModel) => void;
  onRunNow: (item: ScheduledPlaybookViewModel) => void;
  onDelete: (item: ScheduledPlaybookViewModel) => void;
  busyId?: string | null;
};

export default function ScheduleListTable({
  items,
  selectedId,
  onSelect,
  onToggleEnabled,
  onEdit,
  onRunNow,
  onDelete,
  busyId,
}: Props) {
  if (!items.length) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-100 bg-[#f8f9fa] text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5">名称</th>
            <th className="px-4 py-2.5">周期</th>
            <th className="px-4 py-2.5">执行 Agent</th>
            <th className="px-4 py-2.5">下次运行</th>
            <th className="px-4 py-2.5">状态</th>
            <th className="px-4 py-2.5 text-right">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => {
            const selected = selectedId === item.id;
            const busy = busyId === item.id;
            return (
              <tr
                key={item.id}
                className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                  selected ? "bg-gray-50 ring-1 ring-inset ring-gray-200" : ""
                }`}
                onClick={() => onSelect(item.id)}
              >
                <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                <td className="px-4 py-3 text-gray-600">{formatScheduleSummary(item)}</td>
                <td className="px-4 py-3 text-gray-600">
                  {item.assigneeAgentName ?? item.assigneeAgentId.slice(0, 8)}
                </td>
                <td className="px-4 py-3 text-gray-600">{formatNextRunLabel(item.nextRunAt)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleEnabled(item, !item.enabled);
                    }}
                    className="text-xs text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-50"
                  >
                    {item.enabled ? "启用" : "暂停"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRunNow(item);
                      }}
                      className="text-xs text-[#2d5a8e] hover:text-[#1e3a5f] disabled:opacity-50"
                    >
                      立即运行
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(item);
                      }}
                      className="text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item);
                      }}
                      className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
