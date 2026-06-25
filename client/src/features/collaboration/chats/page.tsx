import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCompanyStore } from "@/shared/store/companyStore";
import { useAuthStore } from "@/shared/store/authStore";
import {
  deleteTask,
  sendRoomMessage,
  confirmProgram,
  type CollaborationMessage,
} from "@/features/collaboration/chats/api/collaborationApi";
import type { DispatchPlanDraftCardModel } from "./components/DispatchPlanDraftCard";
import type { RichCardQuickAction, TaskSummary } from "./utils/messageExtraction";
import { getTask } from "@/features/tasks/api/tasksApi";
import {
  CeoBriefingModal,
  EXAMPLE_FIRST_MESSAGE,
  useOnboarding,
  type OnboardingLocationState,
} from "@/features/onboarding";
import { resolveDisplayName } from "@/features/profile/utils";
import { decodeJwtPayload } from "@/shared/auth/decodeJwtPayload";
import { useChatStore } from "./store/chatStore";
import { useRoomData } from "./hooks/useRoomData";
import { useMessageData } from "./hooks/useMessageData";
import { useApprovalWorkflow } from "./hooks/useApprovalWorkflow";
import { useChatSocket } from "./hooks/useChatSocket";
import { useChatDerivedState } from "./hooks/useChatDerivedState";
import { useAutoScroll } from "./hooks/useAutoScroll";
import RoomListSidebar from "./components/room-list/RoomListSidebar";
import ChatHeader from "./components/chat-area/ChatHeader";
import MessageList from "./components/chat-area/MessageList";
import ChatFooter from "./components/chat-area/ChatFooter";
import RightSidebar from "./components/sidebar/RightSidebar";
import ChatModals from "./components/modals/ChatModals";

export default function CollaborationChatsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const accessToken = useAuthStore((s) => s.accessToken);
  const {
    enabled: onboardingEnabled,
    hydrated: onboardingHydrated,
    role: onboardingRole,
    isStepComplete,
    markStepComplete,
  } = useOnboarding();

  // ── Store selectors (page-level only) ──
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const setActiveRoomId = useChatStore((s) => s.setActiveRoomId);
  const rooms = useChatStore((s) => s.rooms);
  const messages = useChatStore((s) => s.messages);
  const setMessages = useChatStore((s) => s.setMessages);
  const goalCards = useChatStore((s) => s.goalCards);
  const draftText = useChatStore((s) => s.draftText);
  const setDraftText = useChatStore((s) => s.setDraftText);
  const orchestrationRunsByMessageId = useChatStore((s) => s.orchestrationRunsByMessageId);
  const activeProgram = useChatStore((s) => s.activeProgram);
  const responderThinkingByKey = useChatStore((s) => s.responderThinkingByKey);
  const routingSourceMessageId = useChatStore((s) => s.routingSourceMessageId);
  const sending = useChatStore((s) => s.sending);
  const setSending = useChatStore((s) => s.setSending);
  const errorText = useChatStore((s) => s.errorText);
  const setError = useChatStore((s) => s.setError);
  const noticeText = useChatStore((s) => s.noticeText);
  const setNotice = useChatStore((s) => s.setNotice);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const lastHumanMessageId = useChatStore((s) => s.lastHumanMessageId);
  const setLastHumanMessageId = useChatStore((s) => s.setLastHumanMessageId);
  const activeReplyMessageId = useChatStore((s) => s.activeReplyMessageId);
  const taskSummaryCollapsed = useChatStore((s) => s.taskSummaryCollapsed);
  const setTaskSummaryCollapsed = useChatStore((s) => s.setTaskSummaryCollapsed);
  const highlightedTaskId = useChatStore((s) => s.highlightedTaskId);
  const setHighlightedTaskId = useChatStore((s) => s.setHighlightedTaskId);
  const detailTaskId = useChatStore((s) => s.detailTaskId);
  const setDetailTaskId = useChatStore((s) => s.setDetailTaskId);
  const agentDisplayMap = useChatStore((s) => s.agentDisplayMap);
  const setAgentDisplayMap = useChatStore((s) => s.setAgentDisplayMap);
  const roomMembers = useChatStore((s) => s.roomMembers);
  const loadingMembers = useChatStore((s) => s.loadingMembers);
  const pendingApprovals = useChatStore((s) => s.pendingApprovals);
  const approvalSubmittingMap = useChatStore((s) => s.approvalSubmittingMap);
  const detailTask = useChatStore((s) => s.detailTask);
  const setDetailTask = useChatStore((s) => s.setDetailTask);
  const companyMembershipRole = useChatStore((s) => s.companyMembershipRole);
  const strategyFormOpen = useChatStore((s) => s.strategyFormOpen);
  const setStrategyFormOpen = useChatStore((s) => s.setStrategyFormOpen);
  const dispatchPlanFormOpen = useChatStore((s) => s.dispatchPlanFormOpen);
  const setDispatchPlanFormOpen = useChatStore((s) => s.setDispatchPlanFormOpen);
  const dispatchPlanModalOpen = useChatStore((s) => s.dispatchPlanModalOpen);
  const setDispatchPlanModalOpen = useChatStore((s) => s.setDispatchPlanModalOpen);
  const dispatchPlanModalCard = useChatStore((s) => s.dispatchPlanModalCard);
  const setDispatchPlanModalCard = useChatStore((s) => s.setDispatchPlanModalCard);
  const distributionFormOpen = useChatStore((s) => s.distributionFormOpen);
  const setDistributionFormOpen = useChatStore((s) => s.setDistributionFormOpen);
  const mainRoomDraftState = useChatStore((s) => s.mainRoomDraftState);
  const dispatchPlanDraftState = useChatStore((s) => s.dispatchPlanDraftState);
  const companyDepartmentOptions = useChatStore((s) => s.companyDepartmentOptions);
  const showDeptSystemNotices = useChatStore((s) => s.showDeptSystemNotices);
  const setShowDeptSystemNotices = useChatStore((s) => s.setShowDeptSystemNotices);
  const mainRoomDispatchExpanded = useChatStore((s) => s.mainRoomDispatchExpanded);
  const setMainRoomDispatchExpanded = useChatStore((s) => s.setMainRoomDispatchExpanded);
  const loadingGoals = useChatStore((s) => s.loadingGoals);
  const mobileView = useChatStore((s) => s.mobileView);
  const setMobileView = useChatStore((s) => s.setMobileView);

  // ── Hooks ──
  const { switchRoom } = useRoomData();
  const {
    handleSend,
    handleRichCardQuickAction,
    applyResponderThinkingPayload,
    refreshGoalCardsForRoom,
    scheduleGoalCardsRefresh,
    reloadActiveRoomMessages,
    refetchMainRoomDraftState,
    refreshOrchestrationRunsForRoom,
    refreshActiveProgram,
    patchGoalCardsProgress,
  } = useMessageData();
  const {
    handleApprovalAction,
    startApprovalStatusPolling,
    clearApprovalPoll,
    approvalTimeoutRef,
    approvalPollTimerRef,
    currentApprovalActionIdRef,
  } = useApprovalWorkflow();
  const { socket: socketRef } = useChatSocket({
    applyResponderThinkingPayload,
    mergeOrchestrationRun: (row) => useChatStore.getState().setOrchestrationRun(String(row.sourceMessageId ?? ""), {
      sourceMessageId: String(row.sourceMessageId ?? ""),
      status: String(row.status ?? "running"),
      stage: row.stage ?? null,
      errorMessage: row.errorMessage ?? null,
      metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null,
    }),
    refreshGoalCardsForRoom,
    scheduleGoalCardsRefresh,
    reloadActiveRoomMessages,
    refetchMainRoomDraftState,
    refreshOrchestrationRunsForRoom,
    refreshActiveProgram,
    patchGoalCardsProgress,
    startApprovalStatusPolling,
    clearApprovalPoll,
    approvalTimeoutRef,
    approvalPollTimerRef,
    currentApprovalActionIdRef,
  });
  const derived = useChatDerivedState();

  const {
    activeRoom,
    mainCollaborationRoomId,
    visibleMessages,
    displayMessages,
    messagesToRender,
    deptChatNoiseCount,
    mainRoomDispatchItemCount,
    ackedSubGoalTaskIds,
    pipelineOrchestrationRun,
    inputHint,
    latestCeoV2Ribbon,
    visibleMessagesSignature,
    governanceTimelineEntries,
    latestDispatchFlushFailed,
    latestDispatchSkipped,
    visiblePendingApprovals,
    latestStrategyGoalDraft,
    orchestratedStrategyPlanReadonly,
    showStrategyDraftInTaskSummary,
    latestDispatchPlanDraft,
    sidebarPipelineVisible,
    showDispatchPlanDraftInTaskSummary,
    sidebarStrategyDraftQuickActions,
    latestDistributionDraftRows,
    isReplyToLatestHuman,
  } = derived;
  const { messageListRef, shouldStickToBottomRef } = useAutoScroll(visibleMessages, visibleMessagesSignature, isReplyToLatestHuman);

  const activeThinkingEntries = useMemo(
    () => Object.values(responderThinkingByKey),
    [responderThinkingByKey],
  );

  // ── Local UI state ──
  const [ceoBriefingOpen, setCeoBriefingOpen] = useState(false);
  const [pendingPrefillMessage, setPendingPrefillMessage] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const displayName = useMemo(() => resolveDisplayName(decodeJwtPayload(accessToken)), [accessToken]);
  const taskHighlightTimerRef = useRef<number | null>(null);
  const lastAutoOpenedDispatchPlanRef = useRef<string | null>(null);
  const activeRoomIdRef = useRef<string>(activeRoomId ?? "");
  useEffect(() => { activeRoomIdRef.current = activeRoomId ?? ""; }, [activeRoomId]);

  useEffect(() => {
    const st = (location.state ?? {}) as OnboardingLocationState;
    if (!st.onboardingJustFounded) return;
    setPendingPrefillMessage(true);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!onboardingEnabled || !onboardingHydrated) return;
    if (!isStepComplete("ceo_briefing_modal")) {
      setCeoBriefingOpen(true);
    }
  }, [onboardingEnabled, onboardingHydrated, isStepComplete]);

  const handleCeoBriefingStart = useCallback(() => {
    markStepComplete("ceo_briefing_modal");
    setCeoBriefingOpen(false);
    if (pendingPrefillMessage) {
      setDraftText(EXAMPLE_FIRST_MESSAGE);
      setPendingPrefillMessage(false);
    }
  }, [markStepComplete, pendingPrefillMessage]);

  const handleCeoBriefingLater = useCallback(() => {
    markStepComplete("ceo_briefing_modal", { skipped: true });
    setCeoBriefingOpen(false);
    setPendingPrefillMessage(false);
  }, [markStepComplete]);

  // ── Callbacks ──
  const handleDeleteTask = useCallback(
    async (task: TaskSummary) => {
      const childCount = task.children?.length ?? 0;
      const warn = childCount > 0
        ? `确定删除「${task.title}」及其 ${childCount} 个子任务？此操作不可恢复。`
        : `确定删除「${task.title}」？此操作不可恢复。`;
      if (!window.confirm(warn)) return;
      const roomId = activeRoomIdRef.current;
      setDeletingTaskId(task.id);
      setError("");
      setNotice("");
      try {
        await deleteTask(task.id);
        setNotice(`已删除任务「${task.title}」。`);
        if (roomId) await refreshGoalCardsForRoom(roomId, { showLoading: false });
      } catch (e: any) {
        const body = e?.response?.data;
        const msg =
          (typeof body?.message === "string" && body.message) ||
          (body && typeof body === "object" && typeof (body as any).error === "string" && (body as any).error) ||
          e?.message || "删除任务失败";
        setError(String(msg));
      } finally {
        setDeletingTaskId(null);
      }
    },
    [refreshGoalCardsForRoom, setError, setNotice],
  );

  const focusTaskInSidebar = useCallback((taskId: string) => {
    const id = String(taskId ?? "").trim();
    if (!id) return;
    setTaskSummaryCollapsed(false);
    setHighlightedTaskId(id);
    if (taskHighlightTimerRef.current) window.clearTimeout(taskHighlightTimerRef.current);
    taskHighlightTimerRef.current = window.setTimeout(() => setHighlightedTaskId(null), 3000);
    requestAnimationFrame(() => {
      document.getElementById(`task-row-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [setTaskSummaryCollapsed, setHighlightedTaskId]);

  const openTaskDetail = useCallback((taskId: string) => {
    const id = String(taskId ?? "").trim();
    if (!id) return;
    setDetailTaskId(id);
  }, [setDetailTaskId]);

  const openDispatchPlanModal = useCallback((card: DispatchPlanDraftCardModel) => {
    setDispatchPlanModalCard(card);
    setDispatchPlanModalOpen(true);
  }, [setDispatchPlanModalCard, setDispatchPlanModalOpen]);

  const closeDispatchPlanModal = useCallback(() => {
    setDispatchPlanModalOpen(false);
    setDispatchPlanModalCard(null);
  }, [setDispatchPlanModalOpen, setDispatchPlanModalCard]);

  const closeTaskDetail = useCallback(() => {
    setDetailTaskId(null);
    setDetailTask(null);
  }, [setDetailTaskId, setDetailTask]);

  const refreshAfterTaskChain = useCallback(() => {
    const rid = activeRoomIdRef.current;
    if (rid) void refreshGoalCardsForRoom(rid, { showLoading: false });
    if (detailTaskId) {
      void getTask(detailTaskId).then((t) => setDetailTask(t)).catch(() => undefined);
    }
  }, [detailTaskId, refreshGoalCardsForRoom, setDetailTask]);

  const handleBlockedEscalation = useCallback(
    async (task: TaskSummary) => {
      const roomId = activeRoomIdRef.current;
      if (!roomId || sending) return;
      setSending(true);
      setError("");
      setNotice("");
      try {
        const saved = await sendRoomMessage(
          roomId,
          `【上报主管】子目标「${task.title}」推进受阻，请主管协助协调资源。`,
          { metadata: { messageCategory: "blocked_escalation", taskId: task.id, escalationRequired: true } },
        );
        setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
        setNotice("已向部门群上报受阻情况");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "上报失败");
      } finally {
        setSending(false);
      }
    },
    [sending, setError, setNotice, setSending, setMessages],
  );

  const handleContinueAlignment = useCallback(() => {
    setNotice("请在下方输入框补充目标、边界或疑问，继续与 CEO 对齐。");
    setError("");
  }, [setNotice, setError]);

  const handleExecutionConfirm = useCallback(async () => {
    const roomId = activeRoomIdRef.current;
    if (!roomId || sending) return;
    const goalSummary = String(activeProgram?.goalUnderstanding?.summary ?? "").trim();
    if (activeProgram?.phase === "pending_confirm" && activeProgram.id) {
      setSending(true);
      setError("");
      setNotice("");
      try {
        await confirmProgram(activeProgram.id);
        await refreshActiveProgram(roomId);
        const confirmText = goalSummary ? "按上述目标直接编排下发" : "确认执行";
        const saved = await sendRoomMessage(roomId, confirmText, {
          metadata: { confirmationIntent: "confirm_execution", userConfirmedExecution: true },
        });
        setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
        setLastHumanMessageId(saved.id);
        setNotice("已确认执行，CEO 将按目标理解编排下发。");
      } catch (e: any) {
        setError(e?.message ?? "确认执行失败");
      } finally {
        setSending(false);
      }
      return;
    }
    setSending(true);
    setError("");
    setNotice("");
    try {
      const confirmText = goalSummary ? "按上述目标直接编排下发" : "确认执行";
      const saved = await sendRoomMessage(roomId, confirmText, {
        metadata: { confirmationIntent: "confirm_execution", userConfirmedExecution: true },
      });
      setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
      setLastHumanMessageId(saved.id);
      setNotice("已发送执行确认，CEO 将按授权进入编排。");
    } catch (e: any) {
      setError(e?.message ?? "确认执行失败");
    } finally {
      setSending(false);
    }
  }, [sending, activeProgram, refreshActiveProgram, setError, setNotice, setSending, setMessages, setLastHumanMessageId]);

  const afterMainRoomDraftPatch = useCallback(
    (kind: "strategy" | "distribution" | "dispatch_plan") => {
      reloadActiveRoomMessages();
      void refetchMainRoomDraftState();
      const mainId = rooms.find((r) => r.kind === "main")?.id ?? "";
      if (mainId) scheduleGoalCardsRefresh(mainId, 0);
      setNotice(
        kind === "strategy" ? "交付蓝图草稿已保存。"
          : kind === "dispatch_plan" ? "执行计划草稿已保存。"
          : "部门分工草稿已保存。",
      );
      setError("");
    },
    [rooms, reloadActiveRoomMessages, refetchMainRoomDraftState, scheduleGoalCardsRefresh, setNotice, setError],
  );

  const extractApprovalResumeRichCard = useCallback(
    (metadata: Record<string, unknown> | null | undefined) => {
      if (!metadata || typeof metadata !== "object") return null;
      const richCard = metadata.richCard && typeof metadata.richCard === "object" && !Array.isArray(metadata.richCard)
        ? (metadata.richCard as Record<string, unknown>) : null;
      if (!richCard) return null;
      if (String(richCard.cardType ?? "").trim() !== "approval_resume") return null;
      return {
        kind: typeof richCard.kind === "string" ? richCard.kind : undefined,
        cardType: typeof richCard.cardType === "string" ? richCard.cardType : undefined,
        routePath: typeof richCard.routePath === "string" ? richCard.routePath : null,
        goal: typeof richCard.goal === "string" ? richCard.goal : null,
        planId: typeof richCard.planId === "string" ? richCard.planId : null,
        workflowId: typeof richCard.workflowId === "string" ? richCard.workflowId : null,
        distributionTaskCount: typeof richCard.distributionTaskCount === "number" ? richCard.distributionTaskCount : undefined,
        executionMode: typeof richCard.executionMode === "string" ? richCard.executionMode : undefined,
      };
    },
    [],
  );

  const resolveSenderProfile = useCallback((message: CollaborationMessage) => {
    const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : null;
    const senderNameRaw =
      (metadata?.senderName as string | undefined) ||
      (metadata?.senderDisplayName as string | undefined) ||
      (metadata?.displayName as string | undefined) ||
      (metadata?.agentName as string | undefined) ||
      (metadata?.nickname as string | undefined) || "";
    const senderName = senderNameRaw.trim();
    const shortId = message.senderId.slice(0, 6);
    const isAgent = message.senderType === "agent";
    const isSystemApproval = isAgent && message.senderId === "system-approval";
    const agentDisplay = isAgent ? agentDisplayMap[message.senderId] : undefined;
    const role = String(agentDisplay?.role ?? "").toLowerCase();
    const roleLabel = role === "system" ? "系统" : role === "ceo" ? "CEO" : role === "director" ? "主管" : role === "executor" ? "员工Agent" : "";
    const name = senderName || (isSystemApproval ? "审批系统" : "") || agentDisplay?.name || roleLabel || (isAgent ? `Agent ${shortId}` : `用户 ${shortId}`);
    const avatarText = (isSystemApproval ? "审" : (senderName || message.senderId || (isAgent ? "AG" : "U"))).slice(0, 2).toUpperCase();
    return {
      name,
      avatarText,
      avatarClass: isSystemApproval ? "bg-amber-100 text-amber-800" : isAgent ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700",
    };
  }, [agentDisplayMap]);

  const hasThinkingForMessage = useCallback(
    (messageId: string) =>
      activeThinkingEntries.some((entry) => entry.sourceMessageId === messageId),
    [activeThinkingEntries],
  );

  const handleTaskIntentPatchSpec = useCallback((candidateId: string, patch: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setError("实时连接未建立，无法补充任务候选，请稍后重试。");
      setNotice("");
      return;
    }
    setError("");
    setNotice("正在补充任务候选并重新评估…");
    socket
      .timeout(10000)
      .emit(
        "task_intent:patch_spec",
        { candidateId, patch },
        (err: unknown, ack?: { ok?: boolean; code?: string; message?: string; result?: unknown }) => {
          if (err || !ack?.ok) {
            setError(`任务候选补充失败：${ack?.message || ack?.code || "gateway timeout"}`);
            setNotice("");
            return;
          }
          setNotice("任务候选已更新。若信息已齐全，系统会自动创建正式任务。");
          setError("");
          reloadActiveRoomMessages();
          const roomId = activeRoomIdRef.current;
          if (roomId) scheduleGoalCardsRefresh(roomId, 400);
        },
      );
  }, [setError, setNotice, reloadActiveRoomMessages, scheduleGoalCardsRefresh]);

  const handleTaskIntentConfirm = useCallback((candidateId: string) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setError("实时连接未建立，无法确认任务候选，请稍后重试。");
      setNotice("");
      return;
    }
    setError("");
    setNotice("正在确认任务候选并创建正式任务…");
    socket
      .timeout(10000)
      .emit(
        "task_intent:confirm",
        { candidateId },
        (err: unknown, ack?: { ok?: boolean; code?: string; message?: string; result?: any }) => {
          if (err || !ack?.ok) {
            setError(`任务候选确认失败：${ack?.message || ack?.code || "gateway timeout"}`);
            setNotice("");
            return;
          }
          const taskId = String(ack?.result?.materializeResult?.taskId ?? "").trim();
          setNotice(taskId ? `正式任务已创建（${taskId}）。` : "任务候选已确认，正在等待任务创建结果。");
          setError("");
          reloadActiveRoomMessages();
          const roomId = activeRoomIdRef.current;
          if (roomId) scheduleGoalCardsRefresh(roomId, 400);
        },
      );
  }, [setError, setNotice, reloadActiveRoomMessages, scheduleGoalCardsRefresh]);

  // ── Memos ──
  const primaryDeptTaskId = useMemo(() => {
    const flat: TaskSummary[] = [];
    const walk = (nodes: TaskSummary[]) => { for (const n of nodes) { flat.push(n); if (n.children?.length) walk(n.children); } };
    walk(goalCards);
    const active = flat.find((t) => t.status !== "done");
    return (active ?? flat[0])?.id ?? null;
  }, [goalCards]);

  const isCompanyManager = companyMembershipRole === "owner" || companyMembershipRole === "admin";

  const dispatchPlanEditFormInitial = useMemo((): {
    goal: string; bodyMarkdown: string; executionOrder?: string; assignments: import("./MainRoomDraftFormDialogs").DispatchAssignmentForm[];
  } | null => {
    const s = dispatchPlanDraftState;
    if (s?.hasSession && !s.dispatched && Array.isArray(s.assignments) && s.assignments.length > 0) {
      return {
        goal: String(s.goal ?? "").trim(),
        bodyMarkdown: String(s.bodyMarkdown ?? "").trim(),
        executionOrder: s.executionOrder ?? undefined,
        assignments: s.assignments.map((a: any) => ({
          departmentSlug: String(a.departmentSlug ?? "").trim(),
          title: String(a.title ?? "").trim(),
          objective: String(a.objective ?? "").trim(),
          acceptanceCriteriaText: (Array.isArray(a.acceptanceCriteria) ? a.acceptanceCriteria : []).map((c: any) => String(c ?? "").trim()).filter(Boolean).join("\n"),
          dependsOnSlugsText: (Array.isArray(a.dependsOnSlugs) ? a.dependsOnSlugs : []).map((c: any) => String(c ?? "").trim()).filter(Boolean).join(", "),
        })),
      };
    }
    if (latestDispatchPlanDraft?.model) {
      const m = latestDispatchPlanDraft.model;
      return {
        goal: m.goal, bodyMarkdown: "",
        assignments: m.assignments.map((a) => ({
          departmentSlug: a.departmentSlug, title: a.title, objective: a.objective,
          acceptanceCriteriaText: (a.acceptanceCriteria ?? []).join("\n"),
          dependsOnSlugsText: (a.dependsOnSlugs ?? []).join(", "),
        })),
      };
    }
    return null;
  }, [dispatchPlanDraftState, latestDispatchPlanDraft]);

  // ── Effects ──

  // Agent display map
  useEffect(() => {
    const agentIds = Array.from(new Set([
      ...messages.filter((m) => m.senderType === "agent" && !!m.senderId).map((m) => m.senderId),
      ...roomMembers.filter((m) => m.memberType === "agent" && !!m.memberId).map((m) => m.memberId),
      ...activeThinkingEntries.map((entry) => entry.agentId),
    ].filter((id) => !agentDisplayMap[id])));
    if (!agentIds.length) return;
    let disposed = false;
    import("@/features/collaboration/chats/api/collaborationApi").then(({ getAgentProfile }) => {
      Promise.all(agentIds.map(async (id) => {
        try {
          const profile = await getAgentProfile(id);
          const role = typeof profile?.role === "string" ? profile.role : "";
          const normalizedRole = role.toLowerCase();
          const fallbackName = normalizedRole === "ceo" ? "CEO" : `Agent ${id.slice(0, 6)}`;
          return { id, name: (profile?.name || "").trim() || fallbackName, role };
        } catch { return { id, name: `Agent ${id.slice(0, 6)}`, role: "" }; }
      })).then((rows) => {
        if (disposed) return;
        setAgentDisplayMap((prev) => {
          const next = { ...prev };
          rows.forEach((r) => { next[r.id] = { name: r.name, role: r.role || undefined }; });
          return next;
        });
      });
    });
    return () => { disposed = true; };
  }, [messages, roomMembers, agentDisplayMap, activeThinkingEntries, setAgentDisplayMap]);

  // Orchestration polling when WS disconnected
  useEffect(() => {
    if (!activeRoomId || !pipelineOrchestrationRun) return;
    if (wsStatus === "connected") return;
    void refreshOrchestrationRunsForRoom(activeRoomId);
    const timer = window.setInterval(() => { void refreshOrchestrationRunsForRoom(activeRoomId); }, 8000);
    return () => window.clearInterval(timer);
  }, [activeRoomId, pipelineOrchestrationRun, refreshOrchestrationRunsForRoom, wsStatus]);

  // Auto-open dispatch plan modal
  useEffect(() => {
    const draft = latestDispatchPlanDraft;
    if (!draft?.model || draft.model.dispatched) return;
    if (activeRoom?.kind !== "main") return;
    const key = [draft.messageId ?? "", draft.model.planId ?? "", String(draft.model.planRevision ?? 0), draft.model.goal.slice(0, 48)].join("|");
    if (lastAutoOpenedDispatchPlanRef.current === key) return;
    lastAutoOpenedDispatchPlanRef.current = key;
    setDispatchPlanModalCard(draft.model);
    setDispatchPlanModalOpen(true);
    setNotice(draft.model.pendingConfirm ? "CEO 已生成执行计划，请核对并确认是否向各部门下发。" : "CEO 已生成执行计划，请核对分工内容。");
  }, [latestDispatchPlanDraft, activeRoom?.kind, setDispatchPlanModalCard, setDispatchPlanModalOpen, setNotice]);

  // Reset dept notices on room change
  useEffect(() => {
    setShowDeptSystemNotices(false);
    setMainRoomDispatchExpanded(false);
  }, [activeRoomId, activeRoom?.kind, setShowDeptSystemNotices, setMainRoomDispatchExpanded]);

  // Slow-thinking detector
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      useChatStore.getState().batchUpdateResponderThinking((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [key, entry] of Object.entries(next)) {
          const ageMs = now - new Date(entry.startedAt).getTime();
          if (ageMs >= 45_000 && !entry.isSlow) { next[key] = { ...entry, isSlow: true }; changed = true; }
          if (ageMs >= 60_000) { delete next[key]; changed = true; }
        }
        return changed ? next : prev;
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
    <section
      className={`relative grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden bg-white md:gap-4 md:p-4 ${
        mobileView === "room-list" ? "p-0" : "p-3"
      } ${
        taskSummaryCollapsed
          ? "md:grid-cols-[280px_1fr_0px] lg:grid-cols-[280px_1fr_0px]"
          : "md:grid-cols-[280px_1fr_300px] lg:grid-cols-[280px_1fr_340px]"
      }`}
    >
      {/* Room list: always on tablet+; mobile only when selected */}
      <div className={`min-h-0 ${mobileView !== "room-list" ? "hidden md:block" : ""}`}>
        <RoomListSidebar />
      </div>

      {/* Chat area: always on tablet+; mobile only when selected */}
      <div className={`flex min-h-0 flex-col ${mobileView !== "chat" ? "hidden md:flex" : ""}`}>
        <div className="flex h-full min-h-0 flex-col bg-white md:rounded-xl md:border md:border-gray-200 md:shadow-sm">
          <ChatHeader
            activeRoom={activeRoom}
            mainRoomCollaborationModeLabel={derived.mainRoomCollaborationModeLabel}
            latestCeoV2Ribbon={latestCeoV2Ribbon}
            mobileView={mobileView}
            onMobileBack={() => setMobileView("room-list")}
            onToggleSidebar={() => {
              if (taskSummaryCollapsed) {
                setTaskSummaryCollapsed(false);
              }
              setMobileView("sidebar");
            }}
          />

          <div className="flex min-h-0 flex-1 flex-col">
            {/* Messages area */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 py-2 md:px-4 md:py-3">
              <MessageList
                messageListRef={messageListRef}
                messagesToRender={messagesToRender}
                activeRoom={activeRoom}
                activeRoomId={activeRoomId}
                loadingMessages={useChatStore.getState().loadingMessages}
                orchestrationRunsByMessageId={orchestrationRunsByMessageId}
                activeProgram={activeProgram}
                routingSourceMessageId={routingSourceMessageId}
                activeReplyMessageId={activeReplyMessageId}
                ackedSubGoalTaskIds={ackedSubGoalTaskIds}
                dispatchPlanDraftState={dispatchPlanDraftState}
                sending={sending}
                goalCards={goalCards}
                loadingGoals={loadingGoals}
                deptChatNoiseCount={deptChatNoiseCount}
                mainRoomDispatchItemCount={mainRoomDispatchItemCount}
                latestDispatchFlushFailed={latestDispatchFlushFailed}
                latestDispatchSkipped={latestDispatchSkipped}
                activeThinkingEntries={activeThinkingEntries}
                resolveSenderProfile={resolveSenderProfile}
                extractApprovalResumeRichCard={extractApprovalResumeRichCard}
                hasThinkingForMessage={hasThinkingForMessage}
                openTaskDetail={openTaskDetail}
                openDispatchPlanModal={openDispatchPlanModal}
                focusTaskInSidebar={focusTaskInSidebar}
                handleRichCardQuickAction={handleRichCardQuickAction}
                handleExecutionConfirm={() => void handleExecutionConfirm()}
                handleContinueAlignment={handleContinueAlignment}
                handleTaskIntentPatchSpec={handleTaskIntentPatchSpec}
                handleTaskIntentConfirm={handleTaskIntentConfirm}
                handleBlockedEscalation={handleBlockedEscalation}
                showDeptSystemNotices={showDeptSystemNotices}
                setShowDeptSystemNotices={setShowDeptSystemNotices}
                mainRoomDispatchExpanded={mainRoomDispatchExpanded}
                setMainRoomDispatchExpanded={setMainRoomDispatchExpanded}
              />
              <ChatFooter
                activeRoomId={activeRoomId}
                activeRoomKind={activeRoom?.kind}
                goalCards={goalCards}
                sending={sending}
                draftText={draftText}
                inputHint={inputHint}
                onSend={() => void handleSend()}
                onBlockedEscalation={handleBlockedEscalation}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right sidebar: tablet+ always; mobile only when sidebar view selected */}
      <div
        className={`relative h-full min-h-0 ${
          mobileView !== "sidebar" ? "hidden md:block" : ""
        }`}
      >
        <RightSidebar
          activeRoom={activeRoom}
          mainCollaborationRoomId={mainCollaborationRoomId}
          taskSummaryCollapsed={taskSummaryCollapsed}
          setTaskSummaryCollapsed={setTaskSummaryCollapsed}
          showStrategyDraftInTaskSummary={showStrategyDraftInTaskSummary}
          latestStrategyGoalDraft={latestStrategyGoalDraft}
          orchestratedStrategyPlanReadonly={orchestratedStrategyPlanReadonly}
          sidebarStrategyDraftQuickActions={sidebarStrategyDraftQuickActions}
          showDispatchPlanDraftInTaskSummary={showDispatchPlanDraftInTaskSummary}
          latestDispatchPlanDraft={latestDispatchPlanDraft}
          openDispatchPlanModal={openDispatchPlanModal}
          latestDistributionDraftRows={latestDistributionDraftRows}
          latestCeoV2Ribbon={latestCeoV2Ribbon}
          sidebarPipelineVisible={sidebarPipelineVisible}
          pipelineOrchestrationRun={pipelineOrchestrationRun}
          goalCards={goalCards}
          loadingGoals={loadingGoals}
          activeProgram={activeProgram}
          governanceTimelineEntries={governanceTimelineEntries}
          roomMembers={roomMembers}
          agentDisplayMap={agentDisplayMap}
          loadingMembers={loadingMembers}
          visiblePendingApprovals={visiblePendingApprovals}
          approvalSubmittingMap={approvalSubmittingMap}
          handleApprovalAction={handleApprovalAction}
          handleDeleteTask={handleDeleteTask}
          openTaskDetail={openTaskDetail}
          handleExecutionConfirm={() => void handleExecutionConfirm()}
          handleRichCardQuickAction={handleRichCardQuickAction}
          primaryDeptTaskId={primaryDeptTaskId}
          isCompanyManager={isCompanyManager}
          deletingTaskId={deletingTaskId}
          highlightedTaskId={highlightedTaskId}
          sending={sending}
          setStrategyFormOpen={setStrategyFormOpen}
          setDistributionFormOpen={setDistributionFormOpen}
          setDispatchPlanFormOpen={setDispatchPlanFormOpen}
          mobileView={mobileView}
          onMobileBack={() => setMobileView("chat")}
        />
      </div>
    </section>

    <ChatModals
      strategyFormOpen={strategyFormOpen}
      setStrategyFormOpen={setStrategyFormOpen}
      latestStrategyGoalDraft={latestStrategyGoalDraft}
      mainCollaborationRoomId={mainCollaborationRoomId}
      afterMainRoomDraftPatch={afterMainRoomDraftPatch}
      dispatchPlanFormOpen={dispatchPlanFormOpen}
      setDispatchPlanFormOpen={setDispatchPlanFormOpen}
      dispatchPlanEditFormInitial={dispatchPlanEditFormInitial}
      dispatchPlanDraftState={dispatchPlanDraftState}
      companyDepartmentOptions={companyDepartmentOptions}
      distributionFormOpen={distributionFormOpen}
      setDistributionFormOpen={setDistributionFormOpen}
      latestDistributionDraftRows={latestDistributionDraftRows}
      dispatchPlanModalOpen={dispatchPlanModalOpen}
      dispatchPlanModalCard={dispatchPlanModalCard}
      closeDispatchPlanModal={closeDispatchPlanModal}
      handleRichCardQuickAction={handleRichCardQuickAction}
      sending={sending}
      detailTask={detailTask}
      closeTaskDetail={closeTaskDetail}
      activeRoom={activeRoom}
      activeRoomId={activeRoomId}
      refreshAfterTaskChain={refreshAfterTaskChain}
      ceoBriefingOpen={ceoBriefingOpen}
      onboardingRole={onboardingRole}
      displayName={displayName}
      activeCompanyName={activeCompany?.name ?? "工作空间"}
      handleCeoBriefingStart={handleCeoBriefingStart}
      handleCeoBriefingLater={handleCeoBriefingLater}
    />
    </>
  );
}
