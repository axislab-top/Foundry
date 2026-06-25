import { create } from "zustand";
import type { CollaborationMessage, MainRoomDraftState, MainRoomDispatchPlanState, RoomMember } from "../api/collaborationApi";
import type { OrchestrationRunSnapshot } from "../components/MessageProcessingChip";
import type { CollaborationProgramView } from "../utils/programLifecycle";
import type { DispatchPlanDraftCardModel } from "../components/DispatchPlanDraftCard";
import type { ChatRoomListItem, PendingApprovalCard, TaskSummary } from "../utils/messageExtraction";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ResponderThinkingEntry = {
  sourceMessageId: string;
  agentId: string;
  ceoLayer?: string;
  startedAt: string;
  isSlow?: boolean;
};

export type MobileView = "room-list" | "chat" | "sidebar";

// ─── State Shape ─────────────────────────────────────────────────────────────

interface ChatState {
  // ── Room ──
  rooms: ChatRoomListItem[];
  activeRoomId: string;
  loadingRooms: boolean;
  mainRoomBootstrapping: boolean;

  // ── Message ──
  messages: CollaborationMessage[];
  loadingMessages: boolean;
  lastHumanMessageId: string;
  activeReplyMessageId: string;
  draftText: string;
  sending: boolean;

  // ── Sidebar ──
  goalCards: TaskSummary[];
  loadingGoals: boolean;
  deletingTaskId: string | null;
  roomMembers: RoomMember[];
  loadingMembers: boolean;
  membersExpanded: boolean;
  pendingApprovals: PendingApprovalCard[];
  approvalSubmittingMap: Record<string, boolean>;
  taskSummaryCollapsed: boolean;
  highlightedTaskId: string | null;
  detailTaskId: string | null;
  detailTask: import("@/features/tasks/api/tasksTypes").TaskItem | null;

  // ── Orchestration ──
  orchestrationRunsByMessageId: Record<string, OrchestrationRunSnapshot>;
  activeProgram: CollaborationProgramView | null;
  responderThinkingByKey: Record<string, ResponderThinkingEntry>;
  routingSourceMessageId: string | null;
  mainRoomDraftState: MainRoomDraftState | null;
  dispatchPlanDraftState: MainRoomDispatchPlanState | null;

  // ── UI Transient ──
  errorText: string;
  noticeText: string;
  wsStatus: "idle" | "connecting" | "connected" | "disconnected" | "error";
  wsJoinedRoomId: string;
  wsLastError: string;
  showDeptSystemNotices: boolean;
  mainRoomDispatchExpanded: boolean;
  companyDepartmentOptions: Array<{ slug: string; name: string }>;
  companyMembershipRole: string | null;
  agentDisplayMap: Record<string, { name: string; role?: string }>;
  ceoBriefingOpen: boolean;
  strategyFormOpen: boolean;
  dispatchPlanFormOpen: boolean;
  dispatchPlanModalOpen: boolean;
  dispatchPlanModalCard: DispatchPlanDraftCardModel | null;
  distributionFormOpen: boolean;

  // ── Room Last Message Cache ──
  lastMessageByRoomId: Record<string, { text: string; at: string }>;

  // ── Mobile ──
  mobileView: MobileView;

  // ── Actions ──
  setActiveRoomId: (id: string) => void;
  setRooms: (rooms: ChatRoomListItem[]) => void;
  appendMessage: (message: CollaborationMessage) => void;
  upsertMessage: (message: CollaborationMessage) => void;
  patchMessageMetadata: (messageId: string, patch: Record<string, unknown>) => void;
  setMessages: (messages: CollaborationMessage[] | ((prev: CollaborationMessage[]) => CollaborationMessage[])) => void;
  setGoalCards: (cards: TaskSummary[] | ((prev: TaskSummary[]) => TaskSummary[])) => void;
  setOrchestrationRun: (sourceMessageId: string, run: OrchestrationRunSnapshot) => void;
  setOrchestrationRuns: (runs: Record<string, OrchestrationRunSnapshot>) => void;
  setActiveProgram: (program: CollaborationProgramView | null) => void;
  setResponderThinking: (key: string, entry: ResponderThinkingEntry) => void;
  removeResponderThinking: (key: string) => void;
  batchUpdateResponderThinking: (updater: (prev: Record<string, ResponderThinkingEntry>) => Record<string, ResponderThinkingEntry>) => void;
  setRoutingSourceMessageId: (id: string | null) => void;
  setMainRoomDraftState: (state: MainRoomDraftState | null) => void;
  setDispatchPlanDraftState: (state: MainRoomDispatchPlanState | null) => void;
  clearRoomTransientState: () => void;
  setError: (text: string) => void;
  setNotice: (text: string) => void;
  clearErrors: () => void;
  setWsStatus: (status: ChatState["wsStatus"]) => void;
  setWsJoinedRoomId: (id: string) => void;
  setWsLastError: (error: string) => void;
  setDraftText: (text: string) => void;
  setSending: (sending: boolean) => void;
  setLoadingRooms: (loading: boolean) => void;
  setMainRoomBootstrapping: (bootstrapping: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
  setLoadingGoals: (loading: boolean) => void;
  setDeletingTaskId: (id: string | null) => void;
  setLoadingMembers: (loading: boolean) => void;
  setMembersExpanded: (expanded: boolean) => void;
  setRoomMembers: (members: RoomMember[]) => void;
  setPendingApprovals: (approvals: PendingApprovalCard[] | ((prev: PendingApprovalCard[]) => PendingApprovalCard[])) => void;
  updateApprovalStatus: (approvalId: string, status: PendingApprovalCard["status"]) => void;
  setApprovalSubmitting: (approvalId: string, submitting: boolean) => void;
  clearApprovalSubmitting: (approvalId: string) => void;
  toggleTaskSummaryCollapsed: () => void;
  setTaskSummaryCollapsed: (collapsed: boolean) => void;
  setShowDeptSystemNotices: (show: boolean) => void;
  setMainRoomDispatchExpanded: (expanded: boolean) => void;
  setHighlightedTaskId: (id: string | null) => void;
  setDetailTaskId: (id: string | null) => void;
  setDetailTask: (task: import("@/features/tasks/api/tasksTypes").TaskItem | null) => void;
  setCompanyDepartmentOptions: (options: Array<{ slug: string; name: string }>) => void;
  setCompanyMembershipRole: (role: string | null) => void;
  setAgentDisplayMap: (map: Record<string, { name: string; role?: string }> | ((prev: Record<string, { name: string; role?: string }>) => Record<string, { name: string; role?: string }>)) => void;
  setCeoBriefingOpen: (open: boolean) => void;
  setStrategyFormOpen: (open: boolean) => void;
  setDispatchPlanFormOpen: (open: boolean) => void;
  setDispatchPlanModalOpen: (open: boolean) => void;
  setDispatchPlanModalCard: (card: DispatchPlanDraftCardModel | null) => void;
  setDistributionFormOpen: (open: boolean) => void;
  setLastHumanMessageId: (id: string) => void;
  setActiveReplyMessageId: (id: string) => void;
  setMobileView: (view: MobileView) => void;
  updateRoomLastMessage: (roomId: string, text: string, at: string) => void;
  clearRoomUnread: (roomId: string) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>()((set, get) => ({
  // ── Room ──
  rooms: [],
  activeRoomId: "",
  loadingRooms: false,
  mainRoomBootstrapping: false,

  // ── Message ──
  messages: [],
  loadingMessages: false,
  lastHumanMessageId: "",
  activeReplyMessageId: "",
  draftText: "",
  sending: false,

  // ── Sidebar ──
  goalCards: [],
  loadingGoals: false,
  deletingTaskId: null,
  roomMembers: [],
  loadingMembers: false,
  membersExpanded: false,
  pendingApprovals: [],
  approvalSubmittingMap: {},
  taskSummaryCollapsed: false,
  highlightedTaskId: null,
  detailTaskId: null,
  detailTask: null,

  // ── Orchestration ──
  orchestrationRunsByMessageId: {},
  activeProgram: null,
  responderThinkingByKey: {},
  routingSourceMessageId: null,
  mainRoomDraftState: null,
  dispatchPlanDraftState: null,

  // ── UI Transient ──
  errorText: "",
  noticeText: "",
  wsStatus: "idle",
  wsJoinedRoomId: "",
  wsLastError: "",
  showDeptSystemNotices: false,
  mainRoomDispatchExpanded: false,
  companyDepartmentOptions: [],
  companyMembershipRole: null,
  agentDisplayMap: {},
  ceoBriefingOpen: false,
  strategyFormOpen: false,
  dispatchPlanFormOpen: false,
  dispatchPlanModalOpen: false,
  dispatchPlanModalCard: null,
  distributionFormOpen: false,

  // ── Room Last Message Cache ──
  lastMessageByRoomId: {},

  // ── Mobile ──
  mobileView: "room-list",

  // ── Actions ──
  setActiveRoomId: (id) => set({ activeRoomId: id }),
  setRooms: (rooms) => set({ rooms }),
  appendMessage: (message) =>
    set((s) => {
      if (s.messages.some((m) => m.id === message.id)) return s;
      const lastMsg = message.content
        ? { text: message.content.slice(0, 100), at: message.createdAt }
        : s.lastMessageByRoomId[message.roomId];
      return {
        messages: [...s.messages, message],
        ...(lastMsg ? { lastMessageByRoomId: { ...s.lastMessageByRoomId, [message.roomId]: lastMsg } } : {}),
      };
    }),
  upsertMessage: (message) =>
    set((s) => {
      const idx = s.messages.findIndex((m) => m.id === message.id);
      if (idx < 0) {
        const lastMsg = message.content
          ? { text: message.content.slice(0, 100), at: message.createdAt }
          : s.lastMessageByRoomId[message.roomId];
        return {
          messages: [...s.messages, message],
          ...(lastMsg ? { lastMessageByRoomId: { ...s.lastMessageByRoomId, [message.roomId]: lastMsg } } : {}),
        };
      }
      const current = s.messages[idx];
      const prevMeta =
        current.metadata && typeof current.metadata === "object"
          ? (current.metadata as Record<string, unknown>)
          : {};
      const nextMeta =
        message.metadata && typeof message.metadata === "object"
          ? (message.metadata as Record<string, unknown>)
          : {};
      const merged: CollaborationMessage = {
        ...current,
        ...message,
        metadata: { ...prevMeta, ...nextMeta },
      };
      const next = [...s.messages];
      next[idx] = merged;
      return { messages: next };
    }),
  patchMessageMetadata: (messageId, patch) =>
    set((s) => {
      const idx = s.messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return s;
      const current = s.messages[idx];
      const prevMeta =
        current.metadata && typeof current.metadata === "object"
          ? (current.metadata as Record<string, unknown>)
          : {};
      const next = [...s.messages];
      next[idx] = {
        ...current,
        metadata: { ...prevMeta, ...patch },
      };
      return { messages: next };
    }),
  setMessages: (messages) =>
    set((s) => {
      const next = typeof messages === "function" ? messages(s.messages) : messages;
      const lastMsg = next.length > 0 ? next[next.length - 1] : null;
      const cache = lastMsg?.content
        ? { ...s.lastMessageByRoomId, [lastMsg.roomId]: { text: lastMsg.content.slice(0, 100), at: lastMsg.createdAt } }
        : s.lastMessageByRoomId;
      return { messages: next, lastMessageByRoomId: cache };
    }),
  setGoalCards: (cards) =>
    set((s) => ({
      goalCards: typeof cards === "function" ? cards(s.goalCards) : cards,
    })),
  setOrchestrationRun: (sourceMessageId, run) =>
    set((s) => ({
      orchestrationRunsByMessageId: {
        ...s.orchestrationRunsByMessageId,
        [sourceMessageId]: run,
      },
    })),
  setOrchestrationRuns: (runs) => set({ orchestrationRunsByMessageId: runs }),
  setActiveProgram: (program) => set({ activeProgram: program }),
  setResponderThinking: (key, entry) =>
    set((s) => ({
      responderThinkingByKey: { ...s.responderThinkingByKey, [key]: entry },
    })),
  removeResponderThinking: (key) =>
    set((s) => {
      if (!s.responderThinkingByKey[key]) return s;
      const next = { ...s.responderThinkingByKey };
      delete next[key];
      return { responderThinkingByKey: next };
    }),
  batchUpdateResponderThinking: (updater) =>
    set((s) => ({
      responderThinkingByKey: updater(s.responderThinkingByKey),
    })),
  setRoutingSourceMessageId: (id) => set({ routingSourceMessageId: id }),
  setMainRoomDraftState: (state) => set({ mainRoomDraftState: state }),
  setDispatchPlanDraftState: (state) => set({ dispatchPlanDraftState: state }),
  clearRoomTransientState: () =>
    set({
      lastHumanMessageId: "",
      activeReplyMessageId: "",
      pendingApprovals: [],
      approvalSubmittingMap: {},
      responderThinkingByKey: {},
      routingSourceMessageId: null,
      showDeptSystemNotices: false,
      mainRoomDispatchExpanded: false,
    }),
  setError: (text) => set({ errorText: text }),
  setNotice: (text) => set({ noticeText: text }),
  clearErrors: () => set({ errorText: "", noticeText: "" }),
  setWsStatus: (status) => set({ wsStatus: status }),
  setWsJoinedRoomId: (id) => set({ wsJoinedRoomId: id }),
  setWsLastError: (error) => set({ wsLastError: error }),
  setDraftText: (text) => set({ draftText: text }),
  setSending: (sending) => set({ sending }),
  setLoadingRooms: (loading) => set({ loadingRooms: loading }),
  setMainRoomBootstrapping: (bootstrapping) => set({ mainRoomBootstrapping: bootstrapping }),
  setLoadingMessages: (loading) => set({ loadingMessages: loading }),
  setLoadingGoals: (loading) => set({ loadingGoals: loading }),
  setDeletingTaskId: (id) => set({ deletingTaskId: id }),
  setLoadingMembers: (loading) => set({ loadingMembers: loading }),
  setMembersExpanded: (expanded) => set({ membersExpanded: expanded }),
  setRoomMembers: (members) => set({ roomMembers: members }),
  setPendingApprovals: (approvals) =>
    set((s) => ({
      pendingApprovals:
        typeof approvals === "function" ? approvals(s.pendingApprovals) : approvals,
    })),
  updateApprovalStatus: (approvalId, status) =>
    set((s) => ({
      pendingApprovals: s.pendingApprovals
        .map((x) => (x.approvalId === approvalId ? { ...x, status } : x))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
          return String(b.createdAt).localeCompare(String(a.createdAt));
        }),
    })),
  setApprovalSubmitting: (approvalId, submitting) =>
    set((s) => ({
      approvalSubmittingMap: submitting
        ? { ...s.approvalSubmittingMap, [approvalId]: true }
        : (() => {
            const next = { ...s.approvalSubmittingMap };
            delete next[approvalId];
            return next;
          })(),
    })),
  clearApprovalSubmitting: (approvalId) =>
    set((s) => {
      if (!s.approvalSubmittingMap[approvalId]) return s;
      const next = { ...s.approvalSubmittingMap };
      delete next[approvalId];
      return { approvalSubmittingMap: next };
    }),
  toggleTaskSummaryCollapsed: () => set((s) => ({ taskSummaryCollapsed: !s.taskSummaryCollapsed })),
  setTaskSummaryCollapsed: (collapsed) => set({ taskSummaryCollapsed: collapsed }),
  setShowDeptSystemNotices: (show) => set({ showDeptSystemNotices: show }),
  setMainRoomDispatchExpanded: (expanded) => set({ mainRoomDispatchExpanded: expanded }),
  setHighlightedTaskId: (id) => set({ highlightedTaskId: id }),
  setDetailTaskId: (id) => set({ detailTaskId: id }),
  setDetailTask: (task) => set({ detailTask: task }),
  setCompanyDepartmentOptions: (options) => set({ companyDepartmentOptions: options }),
  setCompanyMembershipRole: (role) => set({ companyMembershipRole: role }),
  setAgentDisplayMap: (map) =>
    set((s) => ({
      agentDisplayMap: typeof map === "function" ? map(s.agentDisplayMap) : map,
    })),
  setCeoBriefingOpen: (open) => set({ ceoBriefingOpen: open }),
  setStrategyFormOpen: (open) => set({ strategyFormOpen: open }),
  setDispatchPlanFormOpen: (open) => set({ dispatchPlanFormOpen: open }),
  setDispatchPlanModalOpen: (open) => set({ dispatchPlanModalOpen: open }),
  setDispatchPlanModalCard: (card) => set({ dispatchPlanModalCard: card }),
  setDistributionFormOpen: (open) => set({ distributionFormOpen: open }),
  setLastHumanMessageId: (id) => set({ lastHumanMessageId: id }),
  setActiveReplyMessageId: (id) => set({ activeReplyMessageId: id }),
  setMobileView: (view) => set({ mobileView: view }),
  updateRoomLastMessage: (roomId, text, at) =>
    set((s) => ({
      lastMessageByRoomId: { ...s.lastMessageByRoomId, [roomId]: { text: text.slice(0, 100), at } },
    })),
  clearRoomUnread: (roomId) =>
    set((s) => ({
      rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)),
    })),
}));
