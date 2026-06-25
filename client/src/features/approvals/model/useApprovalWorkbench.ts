import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  approveApproval,
  getApproval,
  getApprovalStats,
  listApprovals,
  rejectApproval,
  type ApprovalItem,
  type ApprovalListFilters,
  type ApprovalScope,
  type ApprovalStats,
  type ApprovalStatus,
} from "@/features/approvals/api/approvalsApi";

export type ApprovalViewKind = "pending" | "center";

export function getApprovalContent(item: ApprovalItem): string {
  const c = item.context && typeof item.context === "object" ? item.context : null;
  if (!c) return item.actionType || "未提供审批内容";
  const direct =
    (typeof c.content === "string" && c.content) ||
    (typeof c.approvalContent === "string" && c.approvalContent) ||
    (typeof c.summary === "string" && c.summary) ||
    (typeof c.title === "string" && c.title) ||
    "";
  if (direct.trim()) return direct.trim();
  const reason = typeof c.reason === "string" ? c.reason.trim() : "";
  return reason ? `${item.actionType} - ${reason}` : item.actionType;
}

export function getApprovalRequester(item: ApprovalItem): string {
  const c = item.context && typeof item.context === "object" ? item.context : null;
  const name =
    (c && typeof c.requesterName === "string" && c.requesterName) ||
    (c && typeof c.requestedByName === "string" && c.requestedByName) ||
    "";
  if (name.trim()) return name.trim();
  const requesterId =
    (c && typeof c.requestedBy === "string" && c.requestedBy) ||
    (c && typeof c.initiatorId === "string" && c.initiatorId) ||
    item.createdBy ||
    "";
  return requesterId ? `用户 ${requesterId.slice(0, 8)}` : "未知";
}

type UseApprovalWorkbenchInput = {
  view: ApprovalViewKind;
};

export function useApprovalWorkbench({ view }: UseApprovalWorkbenchInput) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState("");
  const [activeDetail, setActiveDetail] = useState<ApprovalItem | null>(null);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [actionLoadingMap, setActionLoadingMap] = useState<Record<string, boolean>>({});

  const scope = (searchParams.get("scope") as ApprovalScope | null) ?? (view === "pending" ? "pending" : "company_all");
  const q = searchParams.get("q") ?? "";
  const riskBand = (searchParams.get("riskBand") as "all" | "high" | "medium" | null) ?? "all";
  const status = searchParams.get("status") ?? "";
  const actionType = searchParams.get("actionType") ?? "";

  const filters = useMemo<ApprovalListFilters>(
    () => ({
      scope,
      limit: 30,
      q: q || undefined,
      riskBand,
      status: status || undefined,
      actionType: actionType || undefined,
    }),
    [scope, q, riskBand, status, actionType],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const out = await listApprovals(filters);
      setItems(out.items);
      setNextCursor(out.nextCursor);
      setErrorText("");
      setSelectedIds((prev) => prev.filter((id) => out.items.some((x) => x.id === id)));
      if (activeId) {
        const hit = out.items.find((x) => x.id === activeId);
        if (hit) setActiveDetail(hit);
      }
    } catch (e: any) {
      setErrorText(e?.message ?? "加载审批列表失败");
    } finally {
      setLoading(false);
    }
  }, [activeId, filters]);

  const refreshStats = useCallback(async () => {
    if (view !== "center") return;
    try {
      const out = await getApprovalStats();
      setStats(out);
    } catch {
      setStats(null);
    }
  }, [view]);

  useEffect(() => {
    void refresh();
    void refreshStats();
  }, [refresh, refreshStats]);

  useEffect(() => {
    if (!activeId) {
      setActiveDetail(null);
      return;
    }
    void getApproval(activeId).then((row) => setActiveDetail(row)).catch(() => setActiveDetail(null));
  }, [activeId]);

  const updateSearchParam = useCallback(
    (key: string, value?: string) => {
      const sp = new URLSearchParams(searchParams);
      if (value && value.trim()) sp.set(key, value.trim());
      else sp.delete(key);
      setSearchParams(sp, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectAllOnPage = useCallback(() => {
    setSelectedIds(items.map((x) => x.id));
  }, [items]);

  const clearSelect = useCallback(() => setSelectedIds([]), []);

  const runAction = useCallback(
    async (ids: string[], approved: boolean, reason?: string) => {
      if (!ids.length) return { ok: 0, failed: 0 };
      let ok = 0;
      let failed = 0;
      for (const id of ids) {
        setActionLoadingMap((prev) => ({ ...prev, [id]: true }));
        try {
          const row = items.find((x) => x.id === id);
          if (!row) continue;
          if (approved) await approveApproval(id, row.actionType || "unknown");
          else await rejectApproval(id, reason || "批量拒绝");
          ok += 1;
        } catch {
          failed += 1;
        } finally {
          setActionLoadingMap((prev) => ({ ...prev, [id]: false }));
        }
      }
      await refresh();
      await refreshStats();
      return { ok, failed };
    },
    [items, refresh, refreshStats],
  );

  const applyRealtimeUpdate = useCallback((approvalId: string, statusRaw: string) => {
    const normalized = String(statusRaw || "").toLowerCase() as ApprovalStatus;
    if (!approvalId || !normalized) return;
    setItems((prev) =>
      prev.map((x) =>
        x.id === approvalId
          ? {
              ...x,
              status: normalized,
              resolvedAt: normalized === "pending" ? x.resolvedAt : new Date().toISOString(),
            }
          : x,
      ),
    );
    if (activeDetail?.id === approvalId) {
      setActiveDetail((prev) => (prev ? { ...prev, status: normalized } : prev));
    }
  }, [activeDetail?.id]);

  return {
    items,
    nextCursor,
    loading,
    errorText,
    selectedIds,
    activeId,
    activeDetail,
    stats,
    scope,
    q,
    riskBand,
    status,
    actionType,
    actionLoadingMap,
    setActiveId,
    setScope: (value: ApprovalScope) => updateSearchParam("scope", value),
    setQ: (value: string) => updateSearchParam("q", value),
    setRiskBand: (value: "all" | "high" | "medium") => updateSearchParam("riskBand", value),
    setStatus: (value: string) => updateSearchParam("status", value),
    setActionType: (value: string) => updateSearchParam("actionType", value),
    toggleSelect,
    selectAllOnPage,
    clearSelect,
    refresh,
    runAction,
    applyRealtimeUpdate,
  };
}

