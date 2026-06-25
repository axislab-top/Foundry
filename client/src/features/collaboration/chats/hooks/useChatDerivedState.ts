import { useMemo } from "react";
import { useChatStore } from "../store/chatStore";
import type { CollaborationMessage } from "../api/collaborationApi";
import type { DistributionDraftRow } from "../components/DistributionDraftTable";
import type { StrategyGoalDraftCardModel } from "../components/StrategyGoalDraftCard";
import type { RichCardQuickAction } from "../utils/messageExtraction";
import {
  DEFAULT_STRATEGY_GOAL_DRAFT_ACTIONS,
  extractCeoV2DistributionDraft,
  extractDistributionDraftFromMessageContent,
  extractStrategyGoalDraftActions,
  extractStrategyGoalDraftCard,
  parseStrategyGoalDraftFromMessageContent,
  placeholderStrategyDraftMessage,
  resolveStrategyGoalDisplayFromMainRoomState,
  buildStrategyDisplayModelFromMainRoomDraft,
} from "../utils/messageExtraction";
import {
  resolveDispatchPlanQuickActions,
  resolveLatestDispatchPlanDraft,
  shouldShowDispatchPlanQuickActions,
} from "../utils/dispatchPlanDraftDisplay";
import { hasRunningOrchestrationPhase, parsePhases } from "../utils/orchestrationPhases";
import { shouldShowExecutionPipelineForProgram, type CollaborationProgramView } from "../utils/programLifecycle";
import { findLatestCeoV2ExecutionRibbon } from "../utils/ceoV2Metadata";
import { findLatestAlignmentContext, messageHasReplaySsotSignals, parseCeoPipelineProgress, parseProcessingStatus } from "../utils/replayMetadata";
import { applyMainRoomDispatchItemAckStatus, buildAckedSubGoalTaskIdSet } from "../utils/mainRoomDispatchAck";
import { buildGovernanceTimelineEntries, extractDispatchSkippedRows } from "../utils/governanceTimeline";
import { extractSupervisionDeliverableDigestRichCard, extractMainRoomDispatchItemRichCard } from "../utils/rich-card-extractors";
import { countDeptChatNoise, isDeptChatNoise } from "../utils/deptMessageVisibility";
import { resolveOrchestrationLifecycle } from "../utils/collaborationLifecycle";
import { extractDispatchCompileIssues } from "../utils/dispatchCompileIssues";
import { programPhaseDisplayLabel, resolveProgramInputHint } from "../utils/programLifecycle";

function isHeartbeatMessage(message: CollaborationMessage): boolean {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : null;
  const source = metadata && typeof metadata.source === "string" ? metadata.source.toLowerCase() : "";
  const triggerSource =
    metadata && typeof metadata.triggerSource === "string" ? metadata.triggerSource.toLowerCase() : "";
  const content = typeof message.content === "string" ? message.content.toLowerCase() : "";
  if (source.includes("heartbeat") || triggerSource.includes("heartbeat")) return true;
  if (message.messageType === "system" && content.includes("heartbeat")) return true;
  return false;
}

export function useChatDerivedState() {
  const rooms = useChatStore((s) => s.rooms);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const messages = useChatStore((s) => s.messages);
  const goalCards = useChatStore((s) => s.goalCards);
  const showDeptSystemNotices = useChatStore((s) => s.showDeptSystemNotices);
  const mainRoomDispatchExpanded = useChatStore((s) => s.mainRoomDispatchExpanded);
  const lastHumanMessageId = useChatStore((s) => s.lastHumanMessageId);
  const orchestrationRunsByMessageId = useChatStore((s) => s.orchestrationRunsByMessageId);
  const activeProgram = useChatStore((s) => s.activeProgram);
  const mainRoomDraftState = useChatStore((s) => s.mainRoomDraftState);
  const dispatchPlanDraftState = useChatStore((s) => s.dispatchPlanDraftState);
  const roomMembers = useChatStore((s) => s.roomMembers);
  const pendingApprovals = useChatStore((s) => s.pendingApprovals);

  const activeRoom = useMemo(() => rooms.find((r) => r.id === activeRoomId) ?? null, [rooms, activeRoomId]);
  const mainCollaborationRoomId = useMemo(() => rooms.find((r) => r.kind === "main")?.id ?? "", [rooms]);
  const mainCollaborationRoom = useMemo(() => rooms.find((r) => r.kind === "main"), [rooms]);
  const departmentCollaborationRooms = useMemo(
    () => rooms.filter((r) => r.kind === "department"),
    [rooms],
  );

  const mainRoomCollaborationMode =
    activeRoom?.kind === "main" ? (activeRoom.collaborationMode ?? "discussion") : null;

  const mainRoomCollaborationModeLabel = useMemo(() => {
    if (activeRoom?.kind === "main" && activeProgram) return programPhaseDisplayLabel(activeProgram);
    if (mainRoomCollaborationMode === "execution") return "执行中";
    if (mainRoomCollaborationMode === "direct") return "直聊";
    if (mainRoomCollaborationMode === "approval_wait") return "待审批";
    return "对齐中";
  }, [activeRoom?.kind, activeProgram, mainRoomCollaborationMode]);

  const visibleMessages = useMemo(() => messages.filter((m) => !isHeartbeatMessage(m)), [messages]);

  const deptVisibilityOptions = useMemo(
    () => ({ collaborationMode: activeRoom?.collaborationMode ?? null }),
    [activeRoom?.collaborationMode],
  );

  const deptChatNoiseCount = useMemo(
    () => (activeRoom?.kind === "department" ? countDeptChatNoise(visibleMessages, deptVisibilityOptions) : 0),
    [activeRoom?.kind, visibleMessages, deptVisibilityOptions],
  );

  const displayMessages = useMemo(() => {
    if (activeRoom?.kind !== "department") return visibleMessages;
    if (showDeptSystemNotices) return visibleMessages;
    return visibleMessages.filter((m) => !isDeptChatNoise(m, deptVisibilityOptions));
  }, [activeRoom?.kind, showDeptSystemNotices, visibleMessages, deptVisibilityOptions]);

  const mainRoomDispatchItemCount = useMemo(() => {
    if (activeRoom?.kind !== "main") return 0;
    return visibleMessages.filter((m) => {
      const meta = m.metadata && typeof m.metadata === "object" ? (m.metadata as Record<string, unknown>) : null;
      return meta ? Boolean(extractMainRoomDispatchItemRichCard(meta)) : false;
    }).length;
  }, [activeRoom?.kind, visibleMessages]);

  const messagesToRender = useMemo(() => {
    if (activeRoom?.kind !== "main" || mainRoomDispatchExpanded || mainRoomDispatchItemCount === 0) {
      return displayMessages;
    }
    return displayMessages.filter((m) => {
      const meta = m.metadata && typeof m.metadata === "object" ? (m.metadata as Record<string, unknown>) : null;
      return meta ? !extractMainRoomDispatchItemRichCard(meta) : true;
    });
  }, [activeRoom?.kind, displayMessages, mainRoomDispatchExpanded, mainRoomDispatchItemCount]);

  const activeMainRoomThreadId = useMemo(() => {
    const anchorId = String(lastHumanMessageId ?? "").trim();
    if (!anchorId) return undefined;
    const msg = visibleMessages.find((m) => m.id === anchorId);
    const meta = msg?.metadata && typeof msg.metadata === "object" ? (msg.metadata as Record<string, unknown>) : {};
    const tid = String(meta.threadId ?? meta.collaborationThreadId ?? "").trim();
    return tid && tid.toLowerCase() !== "main" ? tid : undefined;
  }, [visibleMessages, lastHumanMessageId]);

  const ackedSubGoalTaskIds = useMemo(
    () => buildAckedSubGoalTaskIdSet(visibleMessages),
    [visibleMessages],
  );

  const latestAlignmentContext = useMemo(
    () => findLatestAlignmentContext(visibleMessages),
    [visibleMessages],
  );

  const pipelineOrchestrationRun = useMemo(() => {
    const anchorId = String(lastHumanMessageId ?? "").trim();
    if (!anchorId) return null;
    return orchestrationRunsByMessageId[anchorId] ?? null;
  }, [lastHumanMessageId, orchestrationRunsByMessageId]);

  const inputHint = useMemo(() => {
    if (!activeRoomId) return undefined;
    const programHint = activeRoom?.kind === "main" ? resolveProgramInputHint(activeProgram) : null;
    if (programHint) return programHint;
    if (latestAlignmentContext?.alignment.phase === "awaiting_execution_confirm") {
      return "CEO 等待执行确认：可点消息下方卡片，或回复「确认执行 / 定稿」";
    }
    if (activeRoom?.kind === "main") {
      if (mainRoomCollaborationMode === "direct") return "当前为直聊状态，发送普通消息";
      if (mainRoomCollaborationMode === "approval_wait") return "当前等待审批，发送普通消息";
      if (latestAlignmentContext?.alignment.executionIntentDetected) {
        return "CEO 建议进入执行；请使用下方对齐卡片确认，或回复「确认执行」";
      }
    }
    return undefined;
  }, [activeRoomId, activeRoom?.kind, mainRoomCollaborationMode, latestAlignmentContext, activeProgram]);

  const latestCeoV2Ribbon = useMemo(
    () => findLatestCeoV2ExecutionRibbon(visibleMessages),
    [visibleMessages],
  );

  const visibleMessagesSignature = useMemo(() => visibleMessages.map((m) => m.id).join("|"), [visibleMessages]);

  const governanceTimelineEntries = useMemo(
    () =>
      buildGovernanceTimelineEntries(
        visibleMessages.map((m) => ({
          id: m.id,
          createdAt: m.createdAt,
          content: m.content,
          metadata: (m.metadata as Record<string, unknown> | null) ?? null,
        })),
      ),
    [visibleMessages],
  );

  const latestDispatchFlushFailed = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const m = visibleMessages[i];
      const meta = m.metadata && typeof m.metadata === "object" ? (m.metadata as Record<string, unknown>) : null;
      if (!meta) continue;
      if (meta.flushFailed === true) {
        return {
          messageId: m.id,
          error: typeof meta.flushError === "string" ? meta.flushError : "部门下发失败，请稍后重试或联系运维。",
        };
      }
    }
    return null;
  }, [visibleMessages]);

  const latestDispatchSkipped = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const m = visibleMessages[i];
      const meta = m.metadata && typeof m.metadata === "object" ? (m.metadata as Record<string, unknown>) : null;
      const rows = extractDispatchSkippedRows(meta);
      if (rows.length) return rows;
    }
    return [] as ReturnType<typeof extractDispatchSkippedRows>;
  }, [visibleMessages]);

  const sortedRoomMembers = useMemo(() => {
    return [...roomMembers].sort((a, b) => {
      const aOnline = !a.leftAt;
      const bOnline = !b.leftAt;
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      if (a.memberType !== b.memberType) return a.memberType === "agent" ? -1 : 1;
      return String(a.memberId).localeCompare(String(b.memberId));
    });
  }, [roomMembers]);

  const onlineMemberCount = useMemo(() => sortedRoomMembers.filter((m) => !m.leftAt).length, [sortedRoomMembers]);
  const previewMembers = useMemo(() => sortedRoomMembers.slice(0, 8), [sortedRoomMembers]);

  const visiblePendingApprovals = useMemo(
    () => pendingApprovals.filter((item) => item.status === "pending"),
    [pendingApprovals],
  );

  const latestStrategyGoalDraft = useMemo(() => {
    const s = mainRoomDraftState;
    if (s?.hasSession && s.orchestrated) return null;
    if (s?.hasSession && !s.orchestrated && mainCollaborationRoomId) {
      const model = resolveStrategyGoalDisplayFromMainRoomState({
        s,
        mainCollaborationRoomId,
        visibleMessages,
      });
      if (model?.strategyGoal.trim()) {
        const sessionModel = buildStrategyDisplayModelFromMainRoomDraft(s);
        let anchorHasStructuredRich = false;
        const aid = typeof s.sourceStrategyMessageId === "string" ? s.sourceStrategyMessageId.trim() : "";
        if (aid) {
          const m = visibleMessages.find((x) => x.id === aid);
          const meta = m?.metadata && typeof m.metadata === "object" ? m.metadata : null;
          anchorHasStructuredRich = Boolean(extractStrategyGoalDraftCard(meta as Record<string, unknown>));
        }
        return {
          message: placeholderStrategyDraftMessage(mainCollaborationRoomId),
          model,
          fromMetadata: Boolean(sessionModel) || anchorHasStructuredRich,
        };
      }
    }
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const m = visibleMessages[i];
      if (m.senderType !== "agent") continue;
      const meta = m.metadata && typeof m.metadata === "object" ? m.metadata : null;
      const fromMeta = extractStrategyGoalDraftCard(meta as Record<string, unknown>);
      const fromParsed = fromMeta ? null : parseStrategyGoalDraftFromMessageContent(m.content);
      const model = fromMeta ?? fromParsed;
      if (!model) continue;
      return { message: m, model, fromMetadata: Boolean(fromMeta) };
    }
    return null;
  }, [mainRoomDraftState, mainCollaborationRoomId, visibleMessages]);

  const orchestratedStrategyPlanReadonly = useMemo((): { model: StrategyGoalDraftCardModel } | null => {
    const s = mainRoomDraftState;
    if (!s?.hasSession || !s.orchestrated || !mainCollaborationRoomId) return null;
    const model = resolveStrategyGoalDisplayFromMainRoomState({
      s,
      mainCollaborationRoomId,
      visibleMessages,
    });
    if (!model?.strategyGoal.trim()) return null;
    return { model };
  }, [mainRoomDraftState, mainCollaborationRoomId, visibleMessages]);

  const showStrategyDraftInTaskSummary = useMemo(() => {
    if (activeRoom?.kind !== "main") return false;
    if (mainRoomDraftState?.hasSession && mainRoomDraftState.orchestrated) return false;
    if (!latestStrategyGoalDraft) return false;
    if (goalCards.length === 0) return true;
    const httpMid = mainRoomDraftState?.mainGoalTaskId?.trim();
    if (httpMid && goalCards.some((g) => g.id === httpMid)) return false;
    const draftMid = latestStrategyGoalDraft.model.mainGoalTaskId?.trim();
    if (draftMid && goalCards.some((g) => g.id === draftMid)) return false;
    return true;
  }, [activeRoom?.kind, mainRoomDraftState, latestStrategyGoalDraft, goalCards]);

  const latestDispatchPlanDraft = useMemo(
    () =>
      resolveLatestDispatchPlanDraft({
        dispatchPlanDraftState,
        visibleMessages,
      }),
    [dispatchPlanDraftState, visibleMessages],
  );

  const sidebarPipelineVisible = useMemo(() => {
    if (shouldShowExecutionPipelineForProgram(activeProgram)) return true;
    const phase = latestAlignmentContext?.alignment.phase;
    if (phase === "awaiting_execution_confirm" || phase === "authorized" || phase === "executing") {
      return true;
    }
    if (latestDispatchPlanDraft) return true;
    if (pipelineOrchestrationRun) {
      if (pipelineOrchestrationRun.status === "failed") return true;
      return (
        parsePhases(pipelineOrchestrationRun.metadata).length > 0 ||
        pipelineOrchestrationRun.status === "running"
      );
    }
    return governanceTimelineEntries.length > 0;
  }, [
    activeProgram,
    latestAlignmentContext,
    latestDispatchPlanDraft,
    pipelineOrchestrationRun,
    governanceTimelineEntries,
  ]);

  const showDispatchPlanDraftInTaskSummary = useMemo(() => {
    if (activeRoom?.kind !== "main") return false;
    if (showStrategyDraftInTaskSummary) return false;
    if (!latestDispatchPlanDraft) return false;
    if (dispatchPlanDraftState?.dispatched) return false;
    if (goalCards.length === 0) return true;
    const httpMid = dispatchPlanDraftState?.mainGoalTaskId?.trim();
    if (httpMid && goalCards.some((g) => g.id === httpMid)) return false;
    return true;
  }, [activeRoom?.kind, showStrategyDraftInTaskSummary, latestDispatchPlanDraft, dispatchPlanDraftState, goalCards]);

  const sidebarStrategyDraftQuickActions = useMemo((): RichCardQuickAction[] => {
    const httpQa = mainRoomDraftState?.strategyGoalDraftQuickActions;
    if (Array.isArray(httpQa) && httpQa.length > 0) {
      const mapped = httpQa
        .map((a) => ({
          actionId: String(a.actionId ?? "").trim(),
          label: String(a.label ?? "").trim(),
          sendText: String(a.sendText ?? "").trim(),
        }))
        .filter((a) => a.label && a.sendText);
      if (mapped.length > 0) return mapped;
    }
    if (!latestStrategyGoalDraft) return [];
    const meta =
      latestStrategyGoalDraft.message.metadata && typeof latestStrategyGoalDraft.message.metadata === "object"
        ? latestStrategyGoalDraft.message.metadata
        : null;
    const fromMeta = extractStrategyGoalDraftActions(meta as Record<string, unknown>);
    return fromMeta?.length ? fromMeta : DEFAULT_STRATEGY_GOAL_DRAFT_ACTIONS;
  }, [mainRoomDraftState?.strategyGoalDraftQuickActions, latestStrategyGoalDraft]);

  const latestDistributionDraftRows = useMemo((): DistributionDraftRow[] | null => {
    const dp = dispatchPlanDraftState;
    if (dp?.pendingDistributionConfirm && Array.isArray(dp.distributionPreview) && dp.distributionPreview.length > 0) {
      return dp.distributionPreview.map((r) => ({
        department: String(r.department ?? "").trim() || "—",
        priority: String(r.priority ?? "").trim() || "—",
        deliverable: String(r.deliverable ?? "").trim() || "—",
      }));
    }
    const s = mainRoomDraftState;
    if (s?.pendingDistributionConfirm && Array.isArray(s.distributionPreview) && s.distributionPreview.length > 0) {
      return s.distributionPreview.map((r) => ({
        department: String(r.department ?? "").trim() || "—",
        priority: String(r.priority ?? "").trim() || "—",
        deliverable: String(r.deliverable ?? "").trim() || "—",
      }));
    }
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const m = visibleMessages[i];
      if (m.senderType !== "agent") continue;
      const meta = m.metadata && typeof m.metadata === "object" ? m.metadata : null;
      const fromMeta =
        extractCeoV2DistributionDraft(meta as Record<string, unknown> | null) ??
        extractDistributionDraftFromMessageContent(m.content);
      if (fromMeta && fromMeta.length > 0) return fromMeta;
    }
    return null;
  }, [dispatchPlanDraftState, mainRoomDraftState, visibleMessages]);

  const isReplyToLatestHuman = (message: CollaborationMessage): boolean => {
    if (!lastHumanMessageId) return false;
    const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : null;
    const directReplyToMessageId = metadata ? (metadata.directReplyToMessageId as string | undefined) : undefined;
    return !!directReplyToMessageId && directReplyToMessageId === lastHumanMessageId && message.senderType === "agent";
  };

  const hasMainRoom = !!rooms.find((r) => r.kind === "main");

  return {
    activeRoom,
    mainCollaborationRoomId,
    mainCollaborationRoom,
    departmentCollaborationRooms,
    mainRoomCollaborationMode,
    mainRoomCollaborationModeLabel,
    visibleMessages,
    displayMessages,
    messagesToRender,
    deptChatNoiseCount,
    mainRoomDispatchItemCount,
    activeMainRoomThreadId,
    ackedSubGoalTaskIds,
    latestAlignmentContext,
    pipelineOrchestrationRun,
    inputHint,
    latestCeoV2Ribbon,
    visibleMessagesSignature,
    governanceTimelineEntries,
    latestDispatchFlushFailed,
    latestDispatchSkipped,
    sortedRoomMembers,
    onlineMemberCount,
    previewMembers,
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
    hasMainRoom,
  };
}
