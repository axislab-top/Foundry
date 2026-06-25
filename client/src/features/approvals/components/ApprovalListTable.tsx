import { getApprovalContent, getApprovalRequester } from "@/features/approvals/model/useApprovalWorkbench";
import type { ApprovalItem } from "@/features/approvals/api/approvalsApi";

type Props = {
  items: ApprovalItem[];
  loading: boolean;
  selectedIds: string[];
  actionLoadingMap: Record<string, boolean>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelect: () => void;
  onPick: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

export default function ApprovalListTable(props: Props) {
  const allSelected = props.items.length > 0 && props.selectedIds.length === props.items.length;
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--border)] bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
        <div>{props.items.length} 条审批</div>
        <button
          type="button"
          onClick={allSelected ? props.onClearSelect : props.onSelectAll}
          className="rounded-md border border-[var(--border)] px-2 py-0.5"
        >
          {allSelected ? "取消全选" : "全选本页"}
        </button>
      </div>
      {props.loading ? (
        <div className="p-4 text-sm text-[var(--text-tertiary)]">加载审批中...</div>
      ) : props.items.length === 0 ? (
        <div className="p-4 text-sm text-[var(--text-tertiary)]">暂无审批记录</div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {props.items.map((item) => (
            <div key={item.id} className="px-3 py-3 hover:bg-[var(--surface)]">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={props.selectedIds.includes(item.id)}
                  onChange={() => props.onToggleSelect(item.id)}
                  className="mt-1"
                />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => props.onPick(item.id)}>
                  <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{getApprovalContent(item)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
                    <span>发起人：{getApprovalRequester(item)}</span>
                    <span>动作：{item.actionType}</span>
                    <span>风险：{item.riskLevel}</span>
                    <span>状态：{item.status}</span>
                  </div>
                </button>
                {item.status === "pending" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={Boolean(props.actionLoadingMap[item.id])}
                      onClick={() => props.onApprove(item.id)}
                      className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs text-white disabled:bg-emerald-300"
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(props.actionLoadingMap[item.id])}
                      onClick={() => props.onReject(item.id)}
                      className="rounded-md bg-rose-600 px-2.5 py-1 text-xs text-white disabled:bg-rose-300"
                    >
                      拒绝
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

