import { useEffect, useMemo, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { env } from "@/shared/config/env";
import { useAuthStore } from "@/shared/store/authStore";
import { useCompanyStore } from "@/shared/store/companyStore";
import ApprovalBatchActionBar from "@/features/approvals/components/ApprovalBatchActionBar";
import ApprovalDetailDrawer from "@/features/approvals/components/ApprovalDetailDrawer";
import ApprovalFiltersBar from "@/features/approvals/components/ApprovalFiltersBar";
import ApprovalListTable from "@/features/approvals/components/ApprovalListTable";
import { useApprovalWorkbench, type ApprovalViewKind } from "@/features/approvals/model/useApprovalWorkbench";

type Props = {
  view: ApprovalViewKind;
  title: string;
  description: string;
};

export default function ApprovalWorkbenchPage({ view, title, description }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const companyId = useCompanyStore((s) => s.activeCompany?.id);
  const socketRef = useRef<Socket | null>(null);
  const workbench = useApprovalWorkbench({ view });
  const { applyRealtimeUpdate, refresh } = workbench;

  const pendingCount = useMemo(() => workbench.items.filter((x) => x.status === "pending").length, [workbench.items]);

  useEffect(() => {
    // ── MOCK 开始：跳过 WebSocket 连接（无后端 WS 服务）。恢复时删除下面这行 return ──
    return;
    // ── MOCK 结束 ──
    if (!companyId || !accessToken) return;
    const wsBase = env.wsUrl.replace(/\/ws\/?$/, "").replace(/^ws:\/\//i, "http://").replace(/^wss:\/\//i, "https://");
    const socket = io(`${wsBase}/collaboration`, {
      transports: ["polling", "websocket"],
      auth: { token: accessToken, companyId },
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      socket.emit("join_company_tasks");
    });
    socket.on("approval:resolved", (payload: any) => {
      const id = String(payload?.approvalId ?? payload?.approvalRequestId ?? "").trim();
      const status = String(payload?.status ?? "").trim().toLowerCase();
      applyRealtimeUpdate(id, status);
    });
    socket.on("approval.updated", (payload: any) => {
      const id = String(payload?.approvalId ?? payload?.approvalRequestId ?? "").trim();
      const status = String(payload?.status ?? "").trim().toLowerCase();
      const approved = typeof payload?.approved === "boolean" ? payload.approved : undefined;
      applyRealtimeUpdate(id, status || (approved ? "approved" : "rejected"));
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, applyRealtimeUpdate, companyId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const rejectOne = async (id: string) => {
    const reason = window.prompt("请输入拒绝理由", "不符合审批要求") || "不符合审批要求";
    await workbench.runAction([id], false, reason);
  };

  const rejectBatch = async () => {
    const reason = window.prompt("请输入批量拒绝理由", "批量审批拒绝") || "批量审批拒绝";
    await workbench.runAction(workbench.selectedIds, false, reason);
    workbench.clearSelect();
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="text-lg font-semibold text-[var(--text-primary)]">{title}</div>
        <div className="mt-1 text-xs text-[var(--text-tertiary)]">{description}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-700">待处理 {pendingCount}</span>
          {workbench.stats ? (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-700">
              本周处理 {workbench.stats.resolvedThisWeekCount}
            </span>
          ) : null}
        </div>
      </div>

      <ApprovalFiltersBar
        scope={workbench.scope}
        q={workbench.q}
        riskBand={workbench.riskBand}
        status={workbench.status}
        actionType={workbench.actionType}
        onScopeChange={workbench.setScope}
        onQChange={workbench.setQ}
        onRiskBandChange={workbench.setRiskBand}
        onStatusChange={workbench.setStatus}
        onActionTypeChange={workbench.setActionType}
      />

      <ApprovalBatchActionBar
        selectedCount={workbench.selectedIds.length}
        onApproveBatch={async () => {
          await workbench.runAction(workbench.selectedIds, true);
          workbench.clearSelect();
        }}
        onRejectBatch={rejectBatch}
        onClear={workbench.clearSelect}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_360px]">
        <ApprovalListTable
          items={workbench.items}
          loading={workbench.loading}
          selectedIds={workbench.selectedIds}
          actionLoadingMap={workbench.actionLoadingMap}
          onToggleSelect={workbench.toggleSelect}
          onSelectAll={workbench.selectAllOnPage}
          onClearSelect={workbench.clearSelect}
          onPick={workbench.setActiveId}
          onApprove={async (id) => {
            await workbench.runAction([id], true);
          }}
          onReject={rejectOne}
        />
        <ApprovalDetailDrawer
          item={workbench.activeDetail}
          onClose={() => workbench.setActiveId("")}
          onApprove={async (id) => {
            await workbench.runAction([id], true);
          }}
          onReject={rejectOne}
          loading={Boolean(workbench.activeId && workbench.actionLoadingMap[workbench.activeId])}
        />
      </div>
      {workbench.errorText ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{workbench.errorText}</div>
      ) : null}
    </section>
  );
}

