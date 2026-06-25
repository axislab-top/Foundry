import { useCallback, useEffect, useRef } from "react";
import { useChatStore } from "../store/chatStore";
import { getApprovalRecord } from "../api/collaborationApi";
import type { PendingApprovalCard } from "../utils/messageExtraction";

export function useApprovalWorkflow() {
  const pendingApprovals = useChatStore((s) => s.pendingApprovals);
  const setPendingApprovals = useChatStore((s) => s.setPendingApprovals);
  const updateApprovalStatus = useChatStore((s) => s.updateApprovalStatus);
  const setApprovalSubmitting = useChatStore((s) => s.setApprovalSubmitting);
  const clearApprovalSubmitting = useChatStore((s) => s.clearApprovalSubmitting);
  const setError = useChatStore((s) => s.setError);
  const setNotice = useChatStore((s) => s.setNotice);

  const approvalTimeoutRef = useRef<Map<string, number>>(new Map());
  const approvalPollTimerRef = useRef<Map<string, number>>(new Map());
  const approvalHydratedRef = useRef<Set<string>>(new Set());
  const currentApprovalActionIdRef = useRef<string>("");

  const normalizeApprovalCardStatus = useCallback(
    (statusRaw: string, approvedFlag?: boolean): PendingApprovalCard["status"] => {
      const normalized = String(statusRaw || "").trim().toLowerCase();
      if (normalized === "approved") return "approved";
      if (normalized === "rejected") return "rejected";
      if (normalized === "expired" || normalized === "cancelled") return "expired";
      if (typeof approvedFlag === "boolean") return approvedFlag ? "approved" : "rejected";
      return "pending";
    },
    [],
  );

  const clearApprovalPoll = useCallback((approvalId: string) => {
    const t = approvalPollTimerRef.current.get(approvalId);
    if (typeof t === "number") {
      window.clearTimeout(t);
      approvalPollTimerRef.current.delete(approvalId);
    }
  }, []);

  const startApprovalStatusPolling = useCallback((approvalId: string, attempt = 0) => {
    if (!approvalId) return;
    clearApprovalPoll(approvalId);
    const timer = window.setTimeout(async () => {
      try {
        const row = await getApprovalRecord(approvalId);
        const status = String(row?.status ?? "").toLowerCase();
        if (status === "approved" || status === "rejected" || status === "expired" || status === "cancelled") {
          clearApprovalPoll(approvalId);
          updateApprovalStatus(
            approvalId,
            status === "approved" ? "approved" : status === "rejected" ? "rejected" : "expired",
          );
          clearApprovalSubmitting(approvalId);
          if (currentApprovalActionIdRef.current === approvalId) {
            setNotice(`审批已更新为 ${status}（${approvalId}）。`);
            setError("");
          }
          return;
        }
      } catch {
        // polling retries continue below
      }
      if (attempt >= 9) {
        clearApprovalPoll(approvalId);
        if (currentApprovalActionIdRef.current === approvalId) {
          setError(`审批状态长时间未更新（${approvalId}），请到审批中心核对该单状态。`);
        }
        return;
      }
      startApprovalStatusPolling(approvalId, attempt + 1);
    }, 3000);
    approvalPollTimerRef.current.set(approvalId, timer);
  }, [clearApprovalPoll, updateApprovalStatus, clearApprovalSubmitting, setNotice, setError]);

  // Hydrate pending approvals from messages
  useEffect(() => {
    const visibleMessages = useChatStore.getState().messages;
    const extractApprovalContent = (payload: Record<string, unknown> | null | undefined): string => {
      if (!payload || typeof payload !== "object") return "";
      const directContent =
        typeof payload.content === "string"
          ? payload.content
          : typeof payload.approvalContent === "string"
            ? payload.approvalContent
            : typeof payload.summary === "string"
              ? payload.summary
              : typeof payload.title === "string"
                ? payload.title
                : "";
      if (directContent.trim()) return directContent.trim();
      const action =
        typeof payload.requestedAction === "string"
          ? payload.requestedAction
          : typeof payload.actionType === "string"
            ? payload.actionType
            : "";
      const reason = typeof payload.reason === "string" ? payload.reason : "";
      return [action ? `审批动作：${action}` : "", reason ? `审批说明：${reason}` : ""].filter(Boolean).join("；");
    };
    const extractApprovalRequester = (payload: Record<string, unknown> | null | undefined): string => {
      if (!payload || typeof payload !== "object") return "";
      const requester =
        typeof payload.requesterName === "string"
          ? payload.requesterName
          : typeof payload.requestedByName === "string"
            ? payload.requestedByName
            : typeof payload.initiatorName === "string"
              ? payload.initiatorName
              : typeof payload.senderName === "string"
                ? payload.senderName
                : "";
      if (requester.trim()) return requester.trim();
      const requesterId =
        typeof payload.requestedBy === "string"
          ? payload.requestedBy
          : typeof payload.initiatorId === "string"
            ? payload.initiatorId
            : typeof payload.actorId === "string"
              ? payload.actorId
              : "";
      return requesterId.trim() ? `用户 ${requesterId.trim().slice(0, 8)}` : "";
    };

    const cards = visibleMessages
      .map((m) => {
        const metadata = m.metadata && typeof m.metadata === "object" ? m.metadata : null;
        const approvalId = metadata
          ? String(
              (metadata.approvalRequestId as string | undefined) ||
                (metadata.approvalId as string | undefined) ||
                "",
            ).trim()
          : "";
        if (!approvalId) return null;
        const statusRaw = metadata ? String((metadata.approvalStatus as string | undefined) || "").trim().toLowerCase() : "";
        const status: PendingApprovalCard["status"] =
          statusRaw === "approved"
            ? "approved"
            : statusRaw === "rejected"
              ? "rejected"
              : statusRaw === "expired"
                ? "expired"
                : "pending";
        const reason = metadata ? String((metadata.reason as string | undefined) || "").trim() : "";
        const content = extractApprovalContent(metadata);
        const requester = extractApprovalRequester(metadata);
        return {
          approvalId,
          content,
          requester,
          reason,
          status,
          createdAt: m.createdAt,
          sourceMessageId: m.id,
        } satisfies PendingApprovalCard;
      })
      .filter((x): x is PendingApprovalCard => x !== null);

    if (!cards.length) return;
    setPendingApprovals((prev) => {
      const map = new Map<string, PendingApprovalCard>();
      for (const item of prev) map.set(item.approvalId, item);
      for (const item of cards) {
        const existing = map.get(item.approvalId);
        if (!existing) {
          map.set(item.approvalId, item);
          continue;
        }
        map.set(item.approvalId, {
          ...existing,
          ...item,
          status: item.status !== "pending" ? item.status : existing.status,
          content: item.content || existing.content,
          requester: item.requester || existing.requester,
          reason: item.reason || existing.reason,
          createdAt: existing.createdAt || item.createdAt,
        });
      }
      return Array.from(map.values()).sort((a, b) => {
        if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
    });
  }, [setPendingApprovals]);

  // Hydrate pending approvals from API
  useEffect(() => {
    const pendingIds = pendingApprovals
      .filter((item) => item.status === "pending" && !approvalHydratedRef.current.has(item.approvalId))
      .map((item) => item.approvalId);
    if (!pendingIds.length) return;

    pendingIds.forEach((id) => approvalHydratedRef.current.add(id));
    let disposed = false;
    void Promise.all(
      pendingIds.map(async (approvalId) => {
        try {
          const row = await getApprovalRecord(approvalId);
          const status = String(row?.status ?? "").toLowerCase();
          return { approvalId, status };
        } catch {
          return { approvalId, status: "" };
        }
      }),
    ).then((rows) => {
      if (disposed) return;
      const statusMap = new Map<string, PendingApprovalCard["status"]>();
      rows.forEach(({ approvalId, status }) => {
        if (status === "approved") statusMap.set(approvalId, "approved");
        else if (status === "rejected") statusMap.set(approvalId, "rejected");
        else if (status === "expired" || status === "cancelled") statusMap.set(approvalId, "expired");
      });
      if (!statusMap.size) return;
      setPendingApprovals((prev) =>
        prev
          .map((item) => (statusMap.has(item.approvalId) ? { ...item, status: statusMap.get(item.approvalId)! } : item))
          .sort((a, b) => {
            if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
            return String(b.createdAt).localeCompare(String(a.createdAt));
          }),
      );
    });
    return () => {
      disposed = true;
    };
  }, [pendingApprovals, setPendingApprovals]);

  // Poll pending approvals
  useEffect(() => {
    const visiblePendingApprovals = pendingApprovals.filter((item) => item.status === "pending");
    const pendingIds = visiblePendingApprovals.map((item) => item.approvalId);
    if (!pendingIds.length) return;
    let disposed = false;
    const timer = window.setInterval(() => {
      void Promise.all(
        pendingIds.map(async (approvalId) => {
          try {
            const row = await getApprovalRecord(approvalId);
            return { approvalId, status: String(row?.status ?? "").toLowerCase() };
          } catch {
            return { approvalId, status: "" };
          }
        }),
      ).then((rows) => {
        if (disposed) return;
        const statusMap = new Map<string, PendingApprovalCard["status"]>();
        rows.forEach(({ approvalId, status }) => {
          const next = normalizeApprovalCardStatus(status);
          if (next !== "pending") statusMap.set(approvalId, next);
        });
        if (!statusMap.size) return;
        setPendingApprovals((prev) =>
          prev
            .map((item) => (statusMap.has(item.approvalId) ? { ...item, status: statusMap.get(item.approvalId)! } : item))
            .sort((a, b) => {
              if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
              return String(b.createdAt).localeCompare(String(a.createdAt));
            }),
        );
      });
    }, 10000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [pendingApprovals, normalizeApprovalCardStatus, setPendingApprovals]);

  // Handle approval action
  const handleApprovalAction = useCallback(
    (approvalId: string, approved: boolean) => {
      const socket = (window as any).__chatSocket as import("socket.io-client").Socket | undefined;
      if (!socket || !socket.connected) {
        setError("实时连接未建立，无法提交审批，请稍后重试。");
        setNotice("");
        return;
      }
      currentApprovalActionIdRef.current = approvalId;
      setError("");
      setNotice("");
      const existingTimer = approvalTimeoutRef.current.get(approvalId);
      if (typeof existingTimer === "number") {
        window.clearTimeout(existingTimer);
        approvalTimeoutRef.current.delete(approvalId);
      }
      setApprovalSubmitting(approvalId, true);
      setNotice(approved ? `正在提交同意（${approvalId}）…` : `正在提交拒绝（${approvalId}）…`);
      void (async () => {
        const setFailSafeTimer = () => {
          const timer = window.setTimeout(() => {
            if (currentApprovalActionIdRef.current !== approvalId) {
              approvalTimeoutRef.current.delete(approvalId);
              return;
            }
            clearApprovalSubmitting(approvalId);
            const currentError = useChatStore.getState().errorText;
            if (!currentError) {
              setError(`审批提交超时（${approvalId}），请重试并在 Network -> WS -> Frames 检查 approval.response 是否发出。`);
            }
            approvalTimeoutRef.current.delete(approvalId);
          }, 15000);
          approvalTimeoutRef.current.set(approvalId, timer);
        };
        try {
          const latest = await getApprovalRecord(approvalId);
          const status = String(latest?.status ?? "").toLowerCase();
          if (status && status !== "pending") {
            updateApprovalStatus(
              approvalId,
              status === "approved" ? "approved" : status === "rejected" ? "rejected" : "expired",
            );
            setNotice(`审批单已是 ${status}（${approvalId}），无需重复提交。`);
            setError("");
            clearApprovalSubmitting(approvalId);
            return;
          }
        } catch {
          // continue emit; gateway ack/error will be the source of truth
        }

        setFailSafeTimer();
        socket
          .timeout(8000)
          .emit(
            "approval.response",
            {
              approvalId,
              approved,
              reason: approved ? "群聊任务概要内同意" : "群聊任务概要内拒绝",
            },
            (err: unknown, ack?: { ok?: boolean; code?: string; message?: string }) => {
              if (err) {
                if (currentApprovalActionIdRef.current !== approvalId) return;
                setError(`网关未确认收到审批提交（${approvalId}），请检查实时连接与网关日志。`);
                setNotice("");
                clearApprovalSubmitting(approvalId);
                return;
              }
              if (!ack?.ok) {
                if (currentApprovalActionIdRef.current !== approvalId) return;
                setError(`审批提交失败（${approvalId}）：${ack?.message || ack?.code || "unknown error"}`);
                setNotice("");
                clearApprovalSubmitting(approvalId);
                return;
              }
              if (currentApprovalActionIdRef.current !== approvalId) return;
              setNotice(
                approved
                  ? `网关已确认同意（${approvalId}），正在等待状态更新。`
                  : `网关已确认拒绝（${approvalId}），正在等待状态更新。`,
              );
              setError("");
            },
          );
      })();
    },
    [setError, setNotice, setApprovalSubmitting, clearApprovalSubmitting, updateApprovalStatus],
  );

  // Cleanup on room change
  useEffect(() => {
    approvalHydratedRef.current.clear();
  }, [useChatStore.getState().activeRoomId]);

  return {
    handleApprovalAction,
    startApprovalStatusPolling,
    clearApprovalPoll,
    approvalTimeoutRef,
    approvalPollTimerRef,
    currentApprovalActionIdRef,
  };
}
