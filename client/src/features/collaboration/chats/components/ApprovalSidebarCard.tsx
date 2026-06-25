import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Clock, ArrowUpRight, Loader2 } from "lucide-react";

export type PendingApprovalCard = {
  approvalId: string;
  content: string;
  requester: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  sourceMessageId: string;
};

const STATUS_ICON = {
  pending: <Clock className="h-3.5 w-3.5 text-amber-600" />,
  approved: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  rejected: <XCircle className="h-3.5 w-3.5 text-rose-600" />,
  expired: <Clock className="h-3.5 w-3.5 text-gray-400" />,
};

const STATUS_LABEL = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已拒绝",
  expired: "已过期",
};

const STATUS_BG = {
  pending: "border-amber-200 bg-amber-50/80",
  approved: "border-emerald-200 bg-emerald-50/80",
  rejected: "border-rose-200 bg-rose-50/80",
  expired: "border-gray-200 bg-gray-50",
};

export default function ApprovalSidebarCard({
  approvals,
  submittingMap,
  onApprove,
  onReject,
  onViewAll,
}: {
  approvals: PendingApprovalCard[];
  submittingMap: Record<string, boolean>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onViewAll?: () => void;
}) {
  if (approvals.length === 0) return null;

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">审批</span>
          {pendingCount > 0 && (
            <span className="flex h-5 min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
              {pendingCount}
            </span>
          )}
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="flex items-center gap-0.5 text-[10px] font-medium text-amber-700 hover:text-amber-900"
          >
            审批中心 <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {approvals.map((item) => {
          const isPending = item.status === "pending";
          const isSubmitting = Boolean(submittingMap[item.approvalId]);

          return (
            <motion.div
              key={item.approvalId}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`rounded-lg border p-2.5 ${STATUS_BG[item.status]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {STATUS_ICON[item.status]}
                    <span className="text-[11px] font-semibold text-gray-800">
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-gray-600">
                    {item.content || item.reason || "—"}
                  </div>
                  {item.requester && (
                    <div className="mt-0.5 text-[10px] text-gray-400">发起人: {item.requester}</div>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[9px] text-gray-400" title={item.approvalId}>
                  {item.approvalId.slice(0, 6)}
                </span>
              </div>

              {isPending && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => onApprove(item.approvalId)}
                    className="flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-3 text-[11px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                    同意
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => onReject(item.approvalId)}
                    className="flex h-7 items-center gap-1 rounded-md border border-gray-300 bg-white px-3 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    拒绝
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
