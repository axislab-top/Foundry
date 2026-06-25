import { useEffect, useRef, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { useCompanyStore } from "@/shared/store/companyStore";
import { useAuthStore } from "@/shared/store/authStore";
import { env, isMockApiEnabled } from "@/shared/config/env";
import { useChatStore, type ResponderThinkingEntry } from "../store/chatStore";
import { attachPhase1CollaborationWsStubs } from "../../realtime/phase1CollaborationWsStubs";
import { attachPhase3RealtimeStubs } from "../../realtime/phase3-realtime-stubs";
import { attachCollaborationMockRealtimeBridge } from "../../realtime/collaboration-mock-realtime-bridge";
import { WS_TRANSIENT_AUTH_ERRORS, isMockWsAuthNoise, agentMessageShouldRefreshGoalCards } from "../utils/messageExtraction";
import { messageHasReplaySsotSignals } from "../utils/replayMetadata";
import type { CollaborationMessage, OrchestrationRunItem } from "../api/collaborationApi";
import type { OrchestrationRunSnapshot } from "../components/MessageProcessingChip";

export function useChatSocket(
  helpers: {
    applyResponderThinkingPayload: (payload: unknown) => void;
    mergeOrchestrationRun: (row: OrchestrationRunItem) => void;
    refreshGoalCardsForRoom: (roomId: string) => void;
    scheduleGoalCardsRefresh: (roomId: string, delayMs: number) => void;
    reloadActiveRoomMessages: () => void;
    refetchMainRoomDraftState: () => void;
    refreshOrchestrationRunsForRoom: (roomId: string) => void;
    refreshActiveProgram: (roomId: string) => void;
    patchGoalCardsProgress: (taskId: string, progress: number, status: string) => void;
    startApprovalStatusPolling: (approvalId: string) => void;
    clearApprovalPoll: (approvalId: string) => void;
    approvalTimeoutRef: React.MutableRefObject<Map<string, number>>;
    approvalPollTimerRef: React.MutableRefObject<Map<string, number>>;
    currentApprovalActionIdRef: React.MutableRefObject<string>;
  },
) {
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const accessToken = useAuthStore((s) => s.accessToken);

  const socketRef = useRef<Socket | null>(null);
  const wsSessionReadyRef = useRef(false);
  const wsSessionReadyFallbackTimerRef = useRef<number | null>(null);
  const prevJoinedRoomIdRef = useRef<string>("");
  const joinedTasksRef = useRef(false);
  const joinTasksRetryTimerRef = useRef<number | null>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const streamBufferRef = useRef<Map<string, string>>(new Map());
  const mainRoomDraftRefetchDebounceRef = useRef<number | null>(null);
  const taskHighlightTimerRef = useRef<number | null>(null);
  const clearReplayMetadataPollRef = useRef<() => void>(() => {});

  // Expose socket on window for approval workflow
  useEffect(() => {
    return () => {
      delete (window as any).__chatSocket;
    };
  }, []);

  const setWsStatus = useChatStore((s) => s.setWsStatus);
  const setWsJoinedRoomId = useChatStore((s) => s.setWsJoinedRoomId);
  const setWsLastError = useChatStore((s) => s.setWsLastError);
  const setError = useChatStore((s) => s.setError);
  const setNotice = useChatStore((s) => s.setNotice);
  const setMessages = useChatStore((s) => s.setMessages);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const upsertMessage = useChatStore((s) => s.upsertMessage);
  const patchMessageMetadata = useChatStore((s) => s.patchMessageMetadata);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const setHighlightedTaskId = useChatStore((s) => s.setHighlightedTaskId);
  const setPendingApprovals = useChatStore((s) => s.setPendingApprovals);
  const updateApprovalStatus = useChatStore((s) => s.updateApprovalStatus);
  const setApprovalSubmitting = useChatStore((s) => s.setApprovalSubmitting);
  const clearApprovalSubmitting = useChatStore((s) => s.clearApprovalSubmitting);
  const setActiveProgram = useChatStore((s) => s.setActiveProgram);
  const batchUpdateResponderThinking = useChatStore((s) => s.batchUpdateResponderThinking);
  const setRoutingSourceMessageId = useChatStore((s) => s.setRoutingSourceMessageId);

  // Main WebSocket lifecycle
  useEffect(() => {
    if (isMockApiEnabled()) {
      setWsStatus("disconnected");
      setWsLastError("");
      return;
    }
    const companyId = activeCompany?.id;
    const token = accessTokenRef.current;
    if (!companyId || !token) return;
    const wsBaseRaw = env.wsUrl.replace(/\/ws\/?$/, "");
    const wsBase = wsBaseRaw
      .replace(/^ws:\/\//i, "http://")
      .replace(/^wss:\/\//i, "https://");
    setWsStatus("connecting");
    setWsLastError("");
    const socket = io(`${wsBase}/collaboration`, {
      transports: ["polling", "websocket"],
      auth: { token, companyId },
    });
    socketRef.current = socket;
    (window as any).__chatSocket = socket;
    const detachPhase1WsStubs = attachPhase1CollaborationWsStubs(socket);
    const detachPhase3WsStubs = attachPhase3RealtimeStubs(socket);

    const clearSessionReadyFallback = () => {
      const t = wsSessionReadyFallbackTimerRef.current;
      if (typeof t === "number") {
        window.clearTimeout(t);
        wsSessionReadyFallbackTimerRef.current = null;
      }
    };

    const syncWsRoomJoin = () => {
      const roomId = useChatStore.getState().activeRoomId;
      if (!roomId) return;
      const prev = prevJoinedRoomIdRef.current;
      if (prev && prev !== roomId) {
        socket.emit("leave_room", { roomId: prev });
      }
      if (prev !== roomId) {
        socket.emit("join_room", { roomId });
      }
    };

    const activateWsSession = () => {
      wsSessionReadyRef.current = true;
      scheduleJoinTasks(0);
      syncWsRoomJoin();
    };

    const clearJoinTasksRetry = () => {
      const t = joinTasksRetryTimerRef.current;
      if (typeof t === "number") {
        window.clearTimeout(t);
        joinTasksRetryTimerRef.current = null;
      }
    };

    const scheduleJoinTasks = (attempt: number) => {
      if (!socket.connected || joinedTasksRef.current) return;
      socket
        .timeout(5000)
        .emit(
          "join_company_tasks",
          (err: unknown, ack?: { ok?: boolean; code?: string; message?: string; companyId?: string }) => {
            if (joinedTasksRef.current) return;
            if (!err && ack?.ok) {
              joinedTasksRef.current = true;
              clearJoinTasksRetry();
              return;
            }
            const nextAttempt = attempt + 1;
            const delay = Math.min(1000 * 2 ** attempt, 10000);
            clearJoinTasksRetry();
            joinTasksRetryTimerRef.current = window.setTimeout(() => {
              scheduleJoinTasks(nextAttempt);
            }, delay);
          },
        );
    };

    const onConnect = () => {
      setWsStatus("connected");
      setWsLastError("");
      wsSessionReadyRef.current = false;
      joinedTasksRef.current = false;
      clearJoinTasksRetry();
      clearSessionReadyFallback();
      wsSessionReadyFallbackTimerRef.current = window.setTimeout(() => {
        wsSessionReadyFallbackTimerRef.current = null;
        if (wsSessionReadyRef.current) return;
        activateWsSession();
      }, 400);
    };

    const onSessionReady = () => {
      clearSessionReadyFallback();
      activateWsSession();
    };

    const onConnectError = (err: any) => {
      const msg = String(err?.message ?? err ?? "connect_error");
      if (isMockWsAuthNoise(msg)) return;
      setWsStatus("error");
      setWsLastError(msg);
      setError(msg);
    };

    const onDisconnect = (reason: any) => {
      setWsStatus("disconnected");
      setWsJoinedRoomId("");
      prevJoinedRoomIdRef.current = "";
      wsSessionReadyRef.current = false;
      joinedTasksRef.current = false;
      clearJoinTasksRetry();
      clearSessionReadyFallback();
      if (reason) setWsLastError(String(reason));
    };

    const onJoined = (payload: any) => {
      const roomId = String(payload?.roomId ?? "").trim();
      if (!roomId) return;
      setWsJoinedRoomId(roomId);
      prevJoinedRoomIdRef.current = roomId;
    };

    const onJoinedTasks = () => {
      joinedTasksRef.current = true;
      clearJoinTasksRetry();
    };

    const onLeft = (payload: any) => {
      const roomId = String(payload?.roomId ?? "").trim();
      if (!roomId) return;
      if (useChatStore.getState().wsJoinedRoomId === roomId) setWsJoinedRoomId("");
      if (prevJoinedRoomIdRef.current === roomId) prevJoinedRoomIdRef.current = "";
    };

    const onGatewayError = (payload: any) => {
      const msg = typeof payload?.message === "string" ? payload.message : "实时连接异常";
      if (isMockWsAuthNoise(msg)) return;
      if (WS_TRANSIENT_AUTH_ERRORS.has(msg)) {
        wsSessionReadyRef.current = false;
        window.setTimeout(() => {
          if (!socket.connected) return;
          activateWsSession();
        }, 300);
        return;
      }
      if (!socket.connected) {
        setWsStatus("error");
      }
      setWsLastError(msg);
      setError(msg);
    };

    const onMainRoomDraftUpdated = (payload: unknown) => {
      const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const roomId = String(p.roomId ?? "").trim();
      const mainId = useChatStore.getState().rooms.find((r) => r.kind === "main")?.id ?? "";
      if (roomId && mainId && roomId === mainId) {
        if (mainRoomDraftRefetchDebounceRef.current != null) {
          window.clearTimeout(mainRoomDraftRefetchDebounceRef.current);
        }
        mainRoomDraftRefetchDebounceRef.current = window.setTimeout(() => {
          mainRoomDraftRefetchDebounceRef.current = null;
          void helpers.refetchMainRoomDraftState();
        }, 350);
      }
      const activeRid = useChatStore.getState().activeRoomId;
      if (roomId && activeRid && roomId === activeRid) {
        helpers.reloadActiveRoomMessages();
      }
    };

    const onTaskProgress = (payload: unknown) => {
      const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
      if (!p) return;
      const taskId = String(p.taskId ?? "").trim();
      if (!taskId) return;
      const progress = Number(p.progress ?? 0);
      const status = String(p.status ?? "in_progress");
      // Patch goal cards progress
      useChatStore.getState().setGoalCards((prev) => {
        const patchNode = (nodes: typeof prev): typeof prev =>
          nodes.map((node) => {
            const children = node.children ? patchNode(node.children) : undefined;
            if (node.id === taskId) {
              const normalizeTaskStatus = (s: string) => {
                if (s === "completed") return "done" as const;
                if (s === "blocked") return "blocked" as const;
                if (s === "in_progress" || s === "review" || s === "awaiting_approval") return "in_progress" as const;
                return "not_started" as const;
              };
              return {
                ...node,
                progress: Math.max(0, Math.min(100, Number(progress) || 0)),
                status: normalizeTaskStatus(status),
                ...(children ? { children } : {}),
              };
            }
            return children ? { ...node, children } : node;
          });
        return patchNode(prev);
      });
      setHighlightedTaskId(taskId);
      if (taskHighlightTimerRef.current != null) {
        window.clearTimeout(taskHighlightTimerRef.current);
      }
      taskHighlightTimerRef.current = window.setTimeout(() => {
        taskHighlightTimerRef.current = null;
        setHighlightedTaskId(null);
      }, 4000);
      window.requestAnimationFrame(() => {
        document.getElementById(`task-row-${taskId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    };

    const onOrchestrationUpdated = (payload: unknown) => {
      const row = payload as OrchestrationRunItem;
      if (!row || typeof row !== "object") return;
      const roomId = useChatStore.getState().activeRoomId;
      if (roomId && String(row.roomId ?? "") !== roomId) return;
      helpers.mergeOrchestrationRun(row);
    };

    const onProgramUpdated = (payload: unknown) => {
      const body = payload as { roomId?: string; program?: import("../utils/programLifecycle").CollaborationProgramView | null };
      if (!body || typeof body !== "object") return;
      const roomId = useChatStore.getState().activeRoomId;
      if (roomId && String(body.roomId ?? "") !== roomId) return;
      if (body.program && typeof body.program === "object") {
        setActiveProgram(body.program);
        return;
      }
      if (roomId) void helpers.refreshActiveProgram(roomId);
    };

    const onResponderThinking = (payload: unknown) => {
      helpers.applyResponderThinkingPayload(payload);
    };

    const onMessageNew = (message: CollaborationMessage) => {
      const roomId = useChatStore.getState().activeRoomId;
      if (!message || message.roomId !== roomId) return;
      const streamId =
        message.metadata &&
        typeof message.metadata === "object" &&
        typeof (message.metadata as any).streamId === "string"
          ? String((message.metadata as any).streamId)
          : "";
      setMessages((prev) => {
        let next = prev;
        if (streamId) {
          const virtualId = `stream:${streamId}`;
          if (next.some((m) => m.id === virtualId)) {
            next = next.filter((m) => m.id !== virtualId);
          }
          streamBufferRef.current.delete(streamId);
        }
        if (next.some((m) => m.id === message.id)) return next;
        return [...next, message];
      });
      if (message.senderType === "agent" && message.senderId) {
        const meta =
          message.metadata && typeof message.metadata === "object"
            ? (message.metadata as Record<string, unknown>)
            : null;
        const replyTo = String(meta?.directReplyToMessageId ?? useChatStore.getState().lastHumanMessageId ?? "").trim();
        if (replyTo) {
          batchUpdateResponderThinking((prev) => {
            const key = `${replyTo}:${message.senderId}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      }
      if (
        message.senderType === "agent" &&
        message.metadata &&
        typeof message.metadata === "object" &&
        agentMessageShouldRefreshGoalCards(message.metadata as Record<string, unknown>)
      ) {
        helpers.scheduleGoalCardsRefresh(roomId, 0);
      }
    };

    const onMessageMetadataUpdated = (message: CollaborationMessage) => {
      const roomId = useChatStore.getState().activeRoomId;
      if (!message || message.roomId !== roomId) return;
      upsertMessage(message);
      if (messageHasReplaySsotSignals(message.metadata as Record<string, unknown> | undefined)) {
        clearReplayMetadataPollRef.current();
      }
    };

    const onMessageChunk = (chunk: any) => {
      const streamId = String(chunk?.streamId ?? "").trim();
      if (!streamId) return;
      const chunkRoomId = String(chunk?.roomId ?? "").trim();
      const roomId = useChatStore.getState().activeRoomId;
      if (chunkRoomId && roomId && chunkRoomId !== roomId) return;
      if (!roomId) return;
      const content = String(chunk?.content ?? "");
      const senderId = String(chunk?.senderId ?? "agent");
      if (senderId && content.trim()) {
        const chunkMeta =
          chunk?.metadata && typeof chunk.metadata === "object"
            ? (chunk.metadata as Record<string, unknown>)
            : null;
        const replyTo = String(
          chunkMeta?.directReplyToMessageId ?? useChatStore.getState().lastHumanMessageId ?? "",
        ).trim();
        if (replyTo) {
          batchUpdateResponderThinking((prev) => {
            const key = `${replyTo}:${senderId}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
        } else {
          batchUpdateResponderThinking((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const [key, entry] of Object.entries(next)) {
              if (entry.agentId === senderId) {
                delete next[key];
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }
      }
      const senderType = (String(chunk?.senderType ?? "agent") as "human" | "agent");
      const createdAt = String(chunk?.createdAt ?? new Date().toISOString());
      const prevText = streamBufferRef.current.get(streamId) ?? "";
      const merged = `${prevText}${content}`;
      streamBufferRef.current.set(streamId, merged);
      const virtualId = `stream:${streamId}`;
      setMessages((prev) => {
        if (!roomId) return prev;
        const next = [...prev];
        const idx = next.findIndex((m) => m.id === virtualId);
        const streamMessage: CollaborationMessage = {
          id: virtualId,
          roomId,
          senderType,
          senderId,
          messageType: "stream_chunk",
          content: merged,
          createdAt,
          metadata: { ...(chunk?.metadata ?? {}), streamId, isStreaming: true },
        };
        if (idx >= 0) next[idx] = streamMessage;
        else next.push(streamMessage);
        return next;
      });
    };

    const onApprovalNeeded = (payload: any) => {
      const roomId = useChatStore.getState().activeRoomId;
      if (!roomId) return;
      const approvalId = String(payload?.approvalId ?? payload?.approvalRequestId ?? "").trim();
      const reason = String(payload?.reason ?? "").trim();
      const extractApprovalContent = (p: Record<string, unknown> | null | undefined): string => {
        if (!p || typeof p !== "object") return "";
        const directContent =
          typeof p.content === "string"
            ? p.content
            : typeof p.approvalContent === "string"
              ? p.approvalContent
              : typeof p.summary === "string"
                ? p.summary
                : typeof p.title === "string"
                  ? p.title
                  : "";
        if (directContent.trim()) return directContent.trim();
        const action = typeof p.requestedAction === "string" ? p.requestedAction : typeof p.actionType === "string" ? p.actionType : "";
        const r = typeof p.reason === "string" ? p.reason : "";
        return [action ? `审批动作：${action}` : "", r ? `审批说明：${r}` : ""].filter(Boolean).join("；");
      };
      const extractApprovalRequester = (p: Record<string, unknown> | null | undefined): string => {
        if (!p || typeof p !== "object") return "";
        const requester =
          typeof p.requesterName === "string"
            ? p.requesterName
            : typeof p.requestedByName === "string"
              ? p.requestedByName
              : typeof p.initiatorName === "string"
                ? p.initiatorName
                : typeof p.senderName === "string"
                  ? p.senderName
                  : "";
        if (requester.trim()) return requester.trim();
        const requesterId =
          typeof p.requestedBy === "string"
            ? p.requestedBy
            : typeof p.initiatorId === "string"
              ? p.initiatorId
              : typeof p.actorId === "string"
                ? p.actorId
                : "";
        return requesterId.trim() ? `用户 ${requesterId.trim().slice(0, 8)}` : "";
      };
      const approvalContent = extractApprovalContent(payload);
      const requester = extractApprovalRequester(payload);
      const id = `approval-needed:${approvalId || Date.now().toString()}`;
      const messageContent = [
        "该任务需要审批后才能继续执行。",
        approvalId ? `审批单号：${approvalId}` : "",
        approvalContent ? `审批内容：${approvalContent}` : reason ? `审批说明：${reason}` : "",
        requester ? `发起人：${requester}` : "",
        "请前往审批中心处理。",
      ].filter(Boolean).join("\n");
      const nextMessage: CollaborationMessage = {
        id,
        roomId,
        senderType: "agent",
        senderId: "system-approval",
        messageType: "system",
        content: messageContent,
        createdAt: new Date().toISOString(),
        metadata: { source: "approval_event", approvalRequestId: approvalId || undefined, approvalStatus: "pending" },
      };
      appendMessage(nextMessage);
      if (approvalId) {
        setPendingApprovals((prev) => {
          const existing = prev.find((x) => x.approvalId === approvalId);
          const nextItem = {
            approvalId,
            content: approvalContent,
            requester,
            reason,
            status: "pending" as const,
            createdAt: new Date().toISOString(),
            sourceMessageId: id,
          };
          const next = existing
            ? prev.map((x) => (x.approvalId === approvalId ? { ...x, ...nextItem, status: "pending" as const } : x))
            : [nextItem, ...prev];
          return next.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        });
      }
    };

    const onApprovalResolved = (payload: any) => {
      const roomId = useChatStore.getState().activeRoomId;
      if (!roomId) return;
      const approvalId = String(payload?.approvalId ?? payload?.approvalRequestId ?? "").trim();
      const statusRaw = String(payload?.status ?? "").trim().toLowerCase();
      const statusLabel =
        statusRaw === "approved" ? "审批通过" : statusRaw === "rejected" ? "审批拒绝" : statusRaw === "expired" ? "审批超时" : "审批状态更新";
      const id = `approval-resolved:${approvalId || Date.now().toString()}:${statusRaw || "unknown"}`;
      const content = [
        `${statusLabel}${approvalId ? `（${approvalId}）` : ""}`,
        statusRaw === "approved" ? "可继续执行。" : statusRaw ? "本次流程已按审批结果处理。" : "",
      ].filter(Boolean).join("\n");
      appendMessage({
        id,
        roomId,
        senderType: "agent",
        senderId: "system-approval",
        messageType: "system",
        content,
        createdAt: new Date().toISOString(),
        metadata: { source: "approval_event", approvalRequestId: approvalId || undefined, approvalStatus: statusRaw || undefined },
      });
      if (approvalId) {
        clearApprovalSubmitting(approvalId);
      }
      if (approvalId) {
        const nextStatus =
          statusRaw === "approved" ? "approved" : statusRaw === "rejected" ? "rejected" : statusRaw === "expired" ? "expired" : "pending";
        updateApprovalStatus(approvalId, nextStatus);
      }
      const roomToRefresh = useChatStore.getState().activeRoomId;
      if (roomToRefresh) {
        helpers.scheduleGoalCardsRefresh(roomToRefresh, 0);
      }
    };

    const onApprovalUpdated = (payload: any) => {
      const approvalId = String(payload?.approvalId ?? payload?.approvalRequestId ?? "").trim();
      const approved = typeof payload?.approved === "boolean" ? payload.approved : undefined;
      const statusRaw = String(payload?.status ?? "");
      const normalized = String(statusRaw || "").trim().toLowerCase();
      const nextStatus =
        normalized === "approved" ? "approved" : normalized === "rejected" ? "rejected" : normalized === "expired" || normalized === "cancelled" ? "expired" : typeof approved === "boolean" ? (approved ? "approved" : "rejected") : "pending";
      if (!approvalId) return;
      clearApprovalSubmitting(approvalId);
      updateApprovalStatus(approvalId, nextStatus);
      setError("");
      const roomToRefresh = useChatStore.getState().activeRoomId;
      if (roomToRefresh && nextStatus !== "pending") {
        helpers.scheduleGoalCardsRefresh(roomToRefresh, 0);
      }
    };

    // Register event handlers
    socket.on("connect", onConnect);
    socket.on("session_ready", onSessionReady);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);
    socket.on("joined", onJoined);
    socket.on("joined_tasks", onJoinedTasks);
    socket.on("left", onLeft);
    socket.on("error", onGatewayError);
    socket.on("main_room_draft:updated", onMainRoomDraftUpdated);
    socket.on("task:progress", onTaskProgress);
    socket.on("orchestration:updated", onOrchestrationUpdated);
    socket.on("program:updated", onProgramUpdated);
    socket.on("responder:thinking", onResponderThinking);
    socket.on("message:new", onMessageNew);
    socket.on("message:metadata_updated", onMessageMetadataUpdated);
    socket.on("message:chunk", onMessageChunk);
    socket.on("approval:needed", onApprovalNeeded);
    socket.on("approval:resolved", onApprovalResolved);
    socket.on("approval:updated", onApprovalUpdated);

    return () => {
      detachPhase1WsStubs();
      detachPhase3WsStubs();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      delete (window as any).__chatSocket;
      clearSessionReadyFallback();
      clearJoinTasksRetry();
    };
  }, [activeCompany?.id, accessToken]);

  // Sync room join when activeRoomId changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!activeRoomId) return;
    if (!socket.connected) return;
    if (!wsSessionReadyRef.current) return;
    const prev = prevJoinedRoomIdRef.current;
    if (prev && prev !== activeRoomId) {
      socket.emit("leave_room", { roomId: prev });
    }
    socket.emit("join_room", { roomId: activeRoomId });
  }, [activeRoomId]);

  // Auth token refresh
  useEffect(() => {
    const socket = socketRef.current;
    const companyId = activeCompany?.id;
    if (!socket || !companyId || !accessToken) return;
    const auth = socket.auth as { token?: string; companyId?: string } | undefined;
    if (auth?.token === accessToken && auth?.companyId === companyId) return;
    socket.auth = { token: accessToken, companyId };
    wsSessionReadyRef.current = false;
    joinedTasksRef.current = false;
    if (socket.connected) socket.disconnect();
    socket.connect();
  }, [accessToken, activeCompany?.id]);

  // Mock realtime bridge
  useEffect(() => {
    if (!isMockApiEnabled()) return;
    return attachCollaborationMockRealtimeBridge({
      onResponderThinking: helpers.applyResponderThinkingPayload,
      onMessageChunk: (chunk: unknown) => {
        const c = chunk as Record<string, unknown>;
        const streamId = String(c?.streamId ?? "").trim();
        if (!streamId) return;
        const chunkRoomId = String(c?.roomId ?? "").trim();
        const roomId = useChatStore.getState().activeRoomId;
        if (chunkRoomId && roomId && chunkRoomId !== roomId) return;
        if (!roomId) return;
        const content = String(c?.content ?? "");
        const senderId = String(c?.senderId ?? "agent");
        const senderType = String(c?.senderType ?? "agent") as "human" | "agent";
        const createdAt = String(c?.createdAt ?? new Date().toISOString());
        const prevText = streamBufferRef.current.get(streamId) ?? "";
        const merged = `${prevText}${content}`;
        streamBufferRef.current.set(streamId, merged);
        const virtualId = `stream:${streamId}`;
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.id === virtualId);
          const streamMessage: CollaborationMessage = {
            id: virtualId,
            roomId,
            senderType,
            senderId,
            messageType: "stream_chunk",
            content: merged,
            createdAt,
            metadata: { ...(c?.metadata as Record<string, unknown> ?? {}), streamId, isStreaming: true },
          };
          if (idx >= 0) next[idx] = streamMessage;
          else next.push(streamMessage);
          return next;
        });
      },
      onMessageNew: (message: unknown) => {
        const m = message as CollaborationMessage;
        const roomId = useChatStore.getState().activeRoomId;
        if (!m || m.roomId !== roomId) return;
        const streamId =
          m.metadata &&
          typeof m.metadata === "object" &&
          typeof (m.metadata as Record<string, unknown>).streamId === "string"
            ? String((m.metadata as Record<string, unknown>).streamId)
            : "";
        setMessages((prev) => {
          let next = prev;
          if (streamId) {
            const virtualId = `stream:${streamId}`;
            if (next.some((x) => x.id === virtualId)) {
              next = next.filter((x) => x.id !== virtualId);
            }
            streamBufferRef.current.delete(streamId);
          }
          if (next.some((x) => x.id === m.id)) return next;
          return [...next, m];
        });
      },
      onDispatchPartialFailed: (payload: unknown) => {
        const body = payload as { roomId?: string; messageId?: string; skipped?: unknown };
        const roomId = String(body?.roomId ?? "").trim();
        if (!roomId || roomId !== useChatStore.getState().activeRoomId) return;
        const messageId = String(body?.messageId ?? "").trim();
        const skipped = Array.isArray(body?.skipped) ? body.skipped : [];
        if (messageId && skipped.length) {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === messageId);
            if (idx < 0) return prev;
            const current = prev[idx];
            const prevMeta =
              current.metadata && typeof current.metadata === "object"
                ? (current.metadata as Record<string, unknown>)
                : {};
            const next = [...prev];
            next[idx] = {
              ...current,
              metadata: { ...prevMeta, dispatchFlushSkipped: skipped },
            };
            return next;
          });
        }
      },
      onOrchestrationUpdated: (payload: unknown) => {
        const row = payload as OrchestrationRunItem;
        if (!row || typeof row !== "object") return;
        const rid = useChatStore.getState().activeRoomId;
        if (rid && String(row.roomId ?? "") !== rid) return;
        helpers.mergeOrchestrationRun(row);
      },
    });
  }, [helpers.applyResponderThinkingPayload, helpers.mergeOrchestrationRun, setMessages]);

  const sendMessage = useCallback((event: string, data?: unknown, callback?: (err: unknown, ack?: unknown) => void) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    if (callback) {
      socket.timeout(8000).emit(event, data, callback);
    } else {
      socket.emit(event, data);
    }
  }, []);

  return { socket: socketRef, sendMessage };
}
