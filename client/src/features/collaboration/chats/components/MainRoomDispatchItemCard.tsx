import { Building2, Clock3, UserCheck } from "lucide-react";
import type { MainRoomDispatchItemRichCard } from "@contracts/types/collaboration-2026";

const STATUS_LABEL: Record<string, string> = {
  pending_ack: "等待主管接单",
  acked: "已接单",
  in_progress: "执行中",
  done: "已完成",
  blocked: "受阻",
};

export default function MainRoomDispatchItemCard({ card }: { card: MainRoomDispatchItemRichCard }) {
  const statusKey = String(card.status ?? "pending_ack").toLowerCase();
  const statusLabel = STATUS_LABEL[statusKey] ?? card.status ?? "—";

  return (
    <div className="mt-2 rounded-xl border border-[#e5e7eb] bg-white text-left shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#e5e7eb] px-3 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#1e3a5f]/10 text-[#1e3a5f]">
          <Building2 className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-gray-900">派活 · {card.deptLabel}</div>
          <div className="text-[10px] text-gray-500">
            {card.ordinal && card.total ? `第 ${card.ordinal}/${card.total} 项` : "部门子目标"}
          </div>
        </div>
        <span className="rounded-md bg-[#f8f9fa] px-1.5 py-0.5 text-[10px] font-medium text-[#1e3a5f] ring-1 ring-[#e5e7eb]">
          {statusLabel}
        </span>
      </div>

      <div className="space-y-2 px-3 py-3">
        <p className="text-[13px] font-medium leading-relaxed text-gray-900">{card.title}</p>
        {card.directorDisplayName ? (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <UserCheck className="h-3 w-3 shrink-0" />
            <span>主管 {card.directorDisplayName}</span>
          </div>
        ) : null}
        {card.dependsOnLabels && card.dependsOnLabels.length > 0 ? (
          <div className="flex items-start gap-1.5 text-[11px] text-gray-600">
            <Clock3 className="mt-0.5 h-3 w-3 shrink-0" />
            <span>依赖：{card.dependsOnLabels.join("、")}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
