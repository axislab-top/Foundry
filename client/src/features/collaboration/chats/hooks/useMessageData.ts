import { useCallback, useEffect, useRef } from "react";
import { useCompanyStore } from "@/shared/store/companyStore";
import { useAuthStore } from "@/shared/store/authStore";
import { useChatStore } from "../store/chatStore";
import {
  listRoomMessages,
  sendRoomMessage,
  listOrchestrationRuns,
  getActiveProgram,
  listGoalCardsByRoom,
  getMainRoomDraftState,
  getMainRoomDispatchPlanDraftState,
  type OrchestrationRunItem,
  type GoalCard,
} from "../api/collaborationApi";
import { normalizePersistedRoomMessages } from "../utils/normalizeRoomMessages";
import { buildMainRoomSendMetadata } from "../utils/deliverableIntent";
import { agentMessageShouldRefreshGoalCards } from "../utils/messageExtraction";
import type { OrchestrationRunSnapshot } from "../components/MessageProcessingChip";
import type { CollaborationProgramView } from "../utils/programLifecycle";
import type { RichCardQuickAction, TaskSummary } from "../utils/messageExtraction";
import { isResponderThinkingDevStubEnabled, simulateResponderThinkingSequence } from "../../realtime/responderThinkingDevStub";
import { useOnboarding } from "@/features/onboarding";

export function useMessageData() {
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const accessToken = useAuthStore((s) => s.accessToken);

  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const rooms = useChatStore((s) => s.rooms);
  const messages = useChatStore((s) => s.messages);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const setMessages = useChatStore((s) => s.setMessages);
  const setLoadingMessages = useChatStore((s) => s.setLoadingMessages);
  const setError = useChatStore((s) => s.setError);
  const setNotice = useChatStore((s) => s.setNotice);
  const setSending = useChatStore((s) => s.setSending);
  const setDraftText = useChatStore((s) => s.setDraftText);
  const setLastHumanMessageId = useChatStore((s) => s.setLastHumanMessageId);
  const setGoalCards = useChatStore((s) => s.setGoalCards);
  const setLoadingGoals = useChatStore((s) => s.setLoadingGoals);
  const setOrchestrationRuns = useChatStore((s) => s.setOrchestrationRuns);
  const setOrchestrationRun = useChatStore((s) => s.setOrchestrationRun);
  const setActiveProgram = useChatStore((s) => s.setActiveProgram);
  const setMainRoomDraftState = useChatStore((s) => s.setMainRoomDraftState);
  const setDispatchPlanDraftState = useChatStore((s) => s.setDispatchPlanDraftState);
  const batchUpdateResponderThinking = useChatStore((s) => s.batchUpdateResponderThinking);

  const {
    enabled: onboardingEnabled,
    markStepComplete,
  } = useOnboarding();

  const goalRefreshTimerRef = useRef<number | null>(null);
  const replayMetadataPollTimersRef = useRef<number[]>([]);

  const clearGoalRefreshTimer = useCallback(() => {
    const t = goalRefreshTimerRef.current;
    if (typeof t === "number") {
      window.clearTimeout(t);
      goalRefreshTimerRef.current = null;
    }
  }, []);

  const toTaskSummaryTree = useCallback((cards: GoalCard[]): TaskSummary[] => {
    const normalizeTaskStatus = (status: string): TaskSummary["status"] => {
      if (status === "completed") return "done";
      if (status === "blocked") return "blocked";
      if (status === "in_progress" || status === "review" || status === "awaiting_approval") return "in_progress";
      return "not_started";
    };
    const nodeMap = new Map<string, TaskSummary>();
    const childrenMap = new Map<string, TaskSummary[]>();
    cards.forEach((card) => {
      nodeMap.set(card.id, {
        id: card.id,
        title: card.title || "未命名目标",
        owner: card.assigneeId || "待分配",
        progress: Number.isFinite(card.progress) ? Number(card.progress) : 0,
        status: normalizeTaskStatus(card.status),
      });
    });
    cards.forEach((card) => {
      if (!card.parentId) return;
      const child = nodeMap.get(card.id);
      if (!child) return;
      const arr = childrenMap.get(card.parentId) ?? [];
      arr.push(child);
      childrenMap.set(card.parentId, arr);
    });
    nodeMap.forEach((node, id) => {
      const children = childrenMap.get(id);
      if (children?.length) node.children = children;
    });
    return cards
      .filter((card) => !card.parentId || !nodeMap.has(card.parentId))
      .map((card) => nodeMap.get(card.id))
      .filter((x): x is TaskSummary => Boolean(x));
  }, []);

  const refreshGoalCardsForRoom = useCallback(
    async (roomId: string, options?: { showLoading?: boolean }) => {
      if (!activeCompany?.id || !roomId) return [] as TaskSummary[];
      if (options?.showLoading) setLoadingGoals(true);
      try {
        const rows = await listGoalCardsByRoom(roomId);
        const tree = toTaskSummaryTree(rows);
        if (useChatStore.getState().activeRoomId === roomId) {
          setGoalCards(tree);
        }
        return tree;
      } catch {
        if (useChatStore.getState().activeRoomId === roomId) {
          setGoalCards([]);
        }
        return [] as TaskSummary[];
      } finally {
        if (options?.showLoading && useChatStore.getState().activeRoomId === roomId) {
          setLoadingGoals(false);
        }
      }
    },
    [activeCompany?.id, toTaskSummaryTree, setGoalCards, setLoadingGoals],
  );

  const scheduleGoalCardsRefresh = useCallback(
    (roomId: string, delayMs: number) => {
      if (goalRefreshTimerRef.current != null) {
        window.clearTimeout(goalRefreshTimerRef.current);
      }
      goalRefreshTimerRef.current = window.setTimeout(() => {
        goalRefreshTimerRef.current = null;
        void refreshGoalCardsForRoom(roomId);
      }, delayMs);
    },
    [refreshGoalCardsForRoom],
  );

  const refreshOrchestrationRunsForRoom = useCallback(
    async (roomId: string) => {
      if (!roomId) return;
      try {
        const rows = await listOrchestrationRuns(roomId, 50);
        if (useChatStore.getState().activeRoomId !== roomId) return;
        const next: Record<string, OrchestrationRunSnapshot> = {};
        for (const row of rows) {
          const sourceMessageId = String(row.sourceMessageId ?? "").trim();
          if (!sourceMessageId) continue;
          next[sourceMessageId] = {
            sourceMessageId,
            status: String(row.status ?? "running"),
            stage: row.stage ?? null,
            errorMessage: row.errorMessage ?? null,
            metadata:
              row.metadata && typeof row.metadata === "object"
                ? (row.metadata as Record<string, unknown>)
                : null,
          };
        }
        setOrchestrationRuns(next);
      } catch {
        if (useChatStore.getState().activeRoomId === roomId) {
          setOrchestrationRuns({});
        }
      }
    },
    [setOrchestrationRuns],
  );

  const refreshActiveProgram = useCallback(async (roomId: string) => {
    if (!roomId) return;
    try {
      const program = await getActiveProgram(roomId);
      setActiveProgram(program as CollaborationProgramView | null);
    } catch {
      setActiveProgram(null);
    }
  }, [setActiveProgram]);

  const applyResponderThinkingPayload = useCallback((payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const row = payload as {
      sourceMessageId?: string;
      status?: string;
      responderAgentIds?: string[];
      ceoLayer?: string;
      startedAt?: string;
    };
    const sourceMessageId = String(row.sourceMessageId ?? "").trim();
    const status = String(row.status ?? "").trim();
    if (!sourceMessageId || !status) return;

    const setRoutingSourceMessageId = useChatStore.getState().setRoutingSourceMessageId;

    if (status === "routing") {
      setRoutingSourceMessageId(sourceMessageId);
      return;
    }

    if (status === "idle") {
      const ids = Array.isArray(row.responderAgentIds)
        ? row.responderAgentIds.map((id) => String(id ?? "").trim()).filter(Boolean)
        : [];
      batchUpdateResponderThinking((prev) => {
        const next = { ...prev };
        for (const agentId of ids) {
          delete next[`${sourceMessageId}:${agentId}`];
        }
        return next;
      });
      const current = useChatStore.getState().routingSourceMessageId;
      setRoutingSourceMessageId(current === sourceMessageId ? null : current);
      return;
    }

    if (status === "thinking") {
      const ids = Array.isArray(row.responderAgentIds)
        ? row.responderAgentIds.map((id) => String(id ?? "").trim()).filter(Boolean)
        : [];
      if (!ids.length) return;
      const startedAt = String(row.startedAt ?? new Date().toISOString());
      const currentRouting = useChatStore.getState().routingSourceMessageId;
      setRoutingSourceMessageId(currentRouting === sourceMessageId ? null : currentRouting);
      batchUpdateResponderThinking((prev) => {
        const next = { ...prev };
        for (const agentId of ids) {
          next[`${sourceMessageId}:${agentId}`] = {
            sourceMessageId,
            agentId,
            ceoLayer: row.ceoLayer ? String(row.ceoLayer) : undefined,
            startedAt,
          };
        }
        return next;
      });
    }
  }, [batchUpdateResponderThinking]);

  // Load messages when room changes
  useEffect(() => {
    if (!activeCompany?.id || !activeRoomId) return;
    let disposed = false;
    setLoadingMessages(true);
    setError("");
    listRoomMessages(activeRoomId)
      .then((rows) => {
        if (disposed) return;
        setMessages(normalizePersistedRoomMessages(rows));
      })
      .catch((e: any) => {
        if (disposed) return;
        setError(e?.message ?? "加载消息失败");
      })
      .finally(() => {
        if (!disposed) setLoadingMessages(false);
      });
    return () => {
      disposed = true;
    };
  }, [activeCompany?.id, activeRoomId, setMessages, setLoadingMessages, setError]);

  // Load goal cards when room changes
  useEffect(() => {
    if (!activeCompany?.id || !activeRoomId) return;
    clearGoalRefreshTimer();
    void refreshGoalCardsForRoom(activeRoomId, { showLoading: true });
    return () => {
      clearGoalRefreshTimer();
    };
  }, [activeCompany?.id, activeRoomId, clearGoalRefreshTimer, refreshGoalCardsForRoom]);

  // Load orchestration runs
  useEffect(() => {
    if (!activeRoomId) {
      setOrchestrationRuns({});
      return;
    }
    void refreshOrchestrationRunsForRoom(activeRoomId);
  }, [activeRoomId, refreshOrchestrationRunsForRoom, setOrchestrationRuns]);

  // Load active program
  useEffect(() => {
    const activeRoom = rooms.find((r) => r.id === activeRoomId);
    if (!activeRoomId || activeRoom?.kind !== "main") {
      setActiveProgram(null);
      return;
    }
    void refreshActiveProgram(activeRoomId);
  }, [activeRoomId, rooms, refreshActiveProgram, setActiveProgram]);

  // Refetch draft state
  const refetchMainRoomDraftState = useCallback(async () => {
    const mainRoomId = rooms.find((r) => r.kind === "main")?.id;
    if (!mainRoomId) return;
    try {
      const [strategyRes, dispatchRes] = await Promise.allSettled([
        getMainRoomDraftState(mainRoomId),
        getMainRoomDispatchPlanDraftState(mainRoomId),
      ]);
      setMainRoomDraftState(strategyRes.status === "fulfilled" ? strategyRes.value : null);
      setDispatchPlanDraftState(dispatchRes.status === "fulfilled" ? dispatchRes.value : null);
    } catch {
      // ignore
    }
  }, [rooms, setMainRoomDraftState, setDispatchPlanDraftState]);

  // Load draft state when main room changes
  useEffect(() => {
    const mainRoomId = rooms.find((r) => r.kind === "main")?.id;
    if (!activeCompany?.id || !mainRoomId) {
      setMainRoomDraftState(null);
      setDispatchPlanDraftState(null);
      return;
    }
    let disposed = false;
    void Promise.allSettled([
      getMainRoomDraftState(mainRoomId),
      getMainRoomDispatchPlanDraftState(mainRoomId),
    ]).then(([strategyRes, dispatchRes]) => {
      if (disposed) return;
      setMainRoomDraftState(strategyRes.status === "fulfilled" ? strategyRes.value : null);
      setDispatchPlanDraftState(dispatchRes.status === "fulfilled" ? dispatchRes.value : null);
    });
    return () => {
      disposed = true;
    };
  }, [activeCompany?.id, rooms, setMainRoomDraftState, setDispatchPlanDraftState]);

  // Reload active room messages
  const reloadActiveRoomMessages = useCallback(() => {
    const roomId = useChatStore.getState().activeRoomId;
    if (!roomId) return;
    void listRoomMessages(roomId).then((rows) => {
      setMessages(normalizePersistedRoomMessages(rows));
    });
  }, [setMessages]);

  // Handle send
  const handleSend = useCallback(async () => {
    const state = useChatStore.getState();
    if (!state.activeRoomId || !state.draftText.trim() || state.sending) return;
    const text = state.draftText.trim();
    setDraftText("");
    setSending(true);
    setError("");
    setNotice("");
    try {
      const activeRoom = rooms.find((r) => r.id === state.activeRoomId);
      const isMainRoom = activeRoom?.kind === "main";
      const mainRoomCollaborationMode = isMainRoom ? (activeRoom?.collaborationMode ?? "discussion") : null;
      const activeProgramState = useChatStore.getState().activeProgram;
      const sendMetadata = isMainRoom
        ? buildMainRoomSendMetadata({
            text,
            collaborationMode: mainRoomCollaborationMode,
            programPhase: activeProgramState?.phase ?? null,
          })
        : undefined;
      const saved = await sendRoomMessage(state.activeRoomId, text, {
        ...(sendMetadata ? { metadata: sendMetadata } : {}),
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === saved.id)) return prev;
        return [...prev, saved];
      });
      setLastHumanMessageId(saved.id);
      if (isMainRoom && onboardingEnabled) {
        markStepComplete("task_first_message");
      }
      if (isMainRoom) {
        setOrchestrationRun(saved.id, {
          sourceMessageId: saved.id,
          status: "running",
          stage: "before_runMainRoomFlow",
        });
        scheduleGoalCardsRefresh(state.activeRoomId, 800);
        void refreshOrchestrationRunsForRoom(state.activeRoomId);
      }
      if (isResponderThinkingDevStubEnabled() && wsStatus !== "connected") {
        simulateResponderThinkingSequence({
          sourceMessageId: saved.id,
          onPayload: applyResponderThinkingPayload,
        });
      }
    } catch (e: any) {
      setError(e?.message ?? "发送失败");
      setDraftText(text);
    } finally {
      setSending(false);
    }
  }, [rooms, wsStatus, onboardingEnabled, markStepComplete, setDraftText, setSending, setError, setNotice, setMessages, setLastHumanMessageId, setOrchestrationRun, scheduleGoalCardsRefresh, refreshOrchestrationRunsForRoom, applyResponderThinkingPayload]);

  // Handle rich card quick action
  const handleRichCardQuickAction = useCallback(async (action: RichCardQuickAction) => {
    const state = useChatStore.getState();
    if (!state.activeRoomId || state.sending) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      let saved;
      if (action.actionId === "dispatch_plan_confirm_flush") {
        saved = await sendRoomMessage(state.activeRoomId, action.sendText, {
          metadata: {
            confirmationIntent: "dispatch_plan_confirm_flush",
            userConfirmedDispatchFlush: true,
          },
        });
        setNotice("已发送下发确认，CEO 将向各部门派发子目标。");
        useChatStore.getState().setDispatchPlanModalOpen(false);
        useChatStore.getState().setDispatchPlanModalCard(null);
      } else if (action.actionId === "dispatch_plan_revise") {
        saved = await sendRoomMessage(state.activeRoomId, action.sendText, {
          metadata: { confirmationIntent: "dispatch_plan_revise" },
        });
      } else if (action.actionId === "orchestration_pause") {
        saved = await sendRoomMessage(state.activeRoomId, action.sendText, {
          metadata: { confirmationIntent: "orchestration_pause" },
        });
        setNotice("已发送暂停编排指令。");
      } else if (action.actionId === "orchestration_revoke") {
        saved = await sendRoomMessage(state.activeRoomId, action.sendText, {
          metadata: { confirmationIntent: "orchestration_revoke" },
        });
        setNotice("已发送撤回任务指令。");
      } else {
        saved = await sendRoomMessage(state.activeRoomId, action.sendText);
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === saved.id)) return prev;
        return [...prev, saved];
      });
      setLastHumanMessageId(saved.id);
      scheduleGoalCardsRefresh(state.activeRoomId, 800);
      void refreshOrchestrationRunsForRoom(state.activeRoomId);
    } catch (e: any) {
      setError(e?.message ?? "发送失败");
    } finally {
      setSending(false);
    }
  }, [setSending, setError, setNotice, setMessages, setLastHumanMessageId, scheduleGoalCardsRefresh, refreshOrchestrationRunsForRoom]);

  // Cleanup on room change
  useEffect(() => {
    useChatStore.getState().clearRoomTransientState();
  }, [activeRoomId]);

  // Cleanup replay poll timers
  useEffect(() => {
    return () => {
      replayMetadataPollTimersRef.current.forEach((t) => window.clearTimeout(t));
      replayMetadataPollTimersRef.current = [];
    };
  }, []);

  const patchGoalCardsProgress = useCallback(
    (taskId: string, progress: number, statusRaw: string) => {
      const normalizeTaskStatus = (status: string): TaskSummary["status"] => {
        if (status === "completed") return "done";
        if (status === "blocked") return "blocked";
        if (status === "in_progress" || status === "review" || status === "awaiting_approval") return "in_progress";
        return "not_started";
      };
      const patchNode = (nodes: TaskSummary[]): TaskSummary[] =>
        nodes.map((node) => {
          const children = node.children ? patchNode(node.children) : undefined;
          if (node.id === taskId) {
            return {
              ...node,
              progress: Math.max(0, Math.min(100, Number(progress) || 0)),
              status: normalizeTaskStatus(statusRaw),
              ...(children ? { children } : {}),
            };
          }
          return children ? { ...node, children } : node;
        });
      setGoalCards((prev) => patchNode(prev));
    },
    [setGoalCards],
  );

  return {
    handleSend,
    handleRichCardQuickAction,
    applyResponderThinkingPayload,
    refreshGoalCardsForRoom,
    scheduleGoalCardsRefresh,
    refreshOrchestrationRunsForRoom,
    refreshActiveProgram,
    reloadActiveRoomMessages,
    refetchMainRoomDraftState,
    patchGoalCardsProgress,
  };
}
