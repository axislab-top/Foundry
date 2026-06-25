import type { ApprovalItem } from "@/features/approvals/api/approvalsApi";
import { getApprovalContent, getApprovalRequester } from "@/features/approvals/model/useApprovalWorkbench";
import ApprovalTimeline from "@/features/approvals/components/ApprovalTimeline";

type Props = {
  item: ApprovalItem | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  loading?: boolean;
};

export default function ApprovalDetailDrawer({ item, onClose, onApprove, onReject, loading }: Props) {
  return (
    <aside className="flex h-full w-full flex-col rounded-lg border border-[var(--border)] bg-white p-3 lg:w-[360px]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--text-primary)]">审批详情</div>
        <button type="button" onClick={onClose} className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs">
          关闭
        </button>
      </div>
      {!item ? (
        <div className="text-xs text-[var(--text-tertiary)]">请选择一条审批记录查看详情。</div>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5">
            <div className="text-sm font-semibold text-[var(--text-primary)]">{getApprovalContent(item)}</div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">发起人：{getApprovalRequester(item)}</div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">动作：{item.actionType}</div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">审批单号：{item.id}</div>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-white p-2.5">
            <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">上下文</div>
            <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--text-tertiary)]">
              {JSON.stringify(item.context ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">时间线</div>
            <ApprovalTimeline item={item} />
          </div>
        </div>
      )}
      {item?.status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => onApprove(item.id)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:bg-emerald-300"
          >
            通过
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => onReject(item.id)}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs text-white disabled:bg-rose-300"
          >
            拒绝
          </button>
        </div>
      ) : null}
    </aside>
  );
}

