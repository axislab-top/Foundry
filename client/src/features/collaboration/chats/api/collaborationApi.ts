import type { MainRoomDraftStateDto } from "@contracts/types";
import { apiClient } from "@/shared/api/client";

/** 与后端 `chat_rooms.collaboration_mode` 一致 */
export type CollaborationRoomCollaborationMode = "discussion" | "direct" | "execution" | "approval_wait";

export type CollaborationRoom = {
  id: string;
  roomType?: string;
  name?: string;
  unreadCount?: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  collaborationMode?: CollaborationRoomCollaborationMode;
  /** 部门群等房间绑定的组织节点（主群通常为 null） */
  organizationNodeId?: string | null;
};

export type CollaborationMessage = {
  id: string;
  roomId: string;
  senderType: "human" | "agent";
  senderId: string;
  messageType: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

export type GoalCard = {
  id: string;
  parentId: string | null;
  title: string;
  status: string;
  progress: number;
  assigneeId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AgentProfile = {
  id: string;
  name?: string | null;
  role?: string | null;
};

export type RoomMember = {
  memberType: "human" | "agent";
  memberId: string;
  leftAt?: string | null;
};

export type ApprovalRecord = {
  id: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
};

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as any;
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

export async function listRooms() {
  const resp = await apiClient.get("/api/v1/collaboration/rooms");
  return unwrapPayload<CollaborationRoom[]>(resp.data);
}

/** 幂等创建/返回主群（Gateway → collaboration.rooms.findMain） */
export async function findMainRoom() {
  const resp = await apiClient.get("/api/v1/collaboration/rooms/main");
  return unwrapPayload<CollaborationRoom | null>(resp.data);
}

/** 查找或创建与 Agent 的私聊房间 */
export async function findOrCreateDirectRoom(agentId: string, agentName: string) {
  const resp = await apiClient.post("/api/v1/collaboration/rooms/direct", { agentId, agentName });
  return unwrapPayload<CollaborationRoom>(resp.data);
}

export async function listRoomMessages(
  roomId: string,
  options?: { limit?: number; threadId?: string | null },
) {
  const limit = options?.limit ?? 100;
  const params: Record<string, string | number> = { limit };
  const tid = String(options?.threadId ?? "").trim();
  if (tid) params.threadId = tid;
  const resp = await apiClient.get(`/api/v1/collaboration/rooms/${roomId}/messages`, {
    params,
  });
  const payload = unwrapPayload<{ items?: CollaborationMessage[] }>(resp.data);
  return payload?.items ?? [];
}

export type DiscussionThreadItem = {
  id: string;
  roomId: string;
  title: string;
  status: string;
  collaborationMode?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function listRoomThreads(roomId: string): Promise<DiscussionThreadItem[]> {
  const resp = await apiClient.get(`/api/v1/collaboration/rooms/${roomId}/threads`);
  const payload = unwrapPayload<DiscussionThreadItem[] | { items?: DiscussionThreadItem[] }>(resp.data);
  if (Array.isArray(payload)) return payload;
  return payload?.items ?? [];
}

export type SendRoomMessageOptions = {
  metadata?: Record<string, unknown>;
  threadId?: string | null;
};

export type OrchestrationRunItem = {
  id: string;
  companyId: string;
  roomId: string;
  sourceMessageId: string;
  workerRunId?: string | null;
  status: string;
  stage?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

function normalizeOutboundThreadId(threadId?: string | null): string | undefined {
  const tid = String(threadId ?? "").trim();
  if (!tid || tid.toLowerCase() === "main") return undefined;
  return tid;
}

export async function sendRoomMessage(roomId: string, content: string, options?: SendRoomMessageOptions) {
  const threadId = normalizeOutboundThreadId(options?.threadId);
  const resp = await apiClient.post("/api/v1/collaboration/messages", {
    roomId,
    content,
    messageType: "text",
    ...(threadId ? { threadId } : {}),
    ...(options?.metadata ? { metadata: options.metadata } : {}),
  });
  return unwrapPayload<CollaborationMessage>(resp.data);
}

export async function listOrchestrationRuns(roomId: string, limit = 40) {
  const resp = await apiClient.get(
    `/api/v1/collaboration/rooms/${encodeURIComponent(roomId)}/orchestration-runs`,
    { params: { limit } },
  );
  const payload = unwrapPayload<{ items?: OrchestrationRunItem[] }>(resp.data);
  return payload?.items ?? [];
}

export type CollaborationProgramItem = import("@contracts/types").CollaborationProgramRecord;

export async function getActiveProgram(roomId: string, threadId?: string | null) {
  const resp = await apiClient.get(
    `/api/v1/collaboration/rooms/${encodeURIComponent(roomId)}/programs/active`,
    { params: threadId ? { threadId } : {} },
  );
  const payload = unwrapPayload<{ program?: CollaborationProgramItem | null }>(resp.data);
  return payload?.program ?? null;
}

export async function listProgramsByRoom(roomId: string, limit = 20) {
  const resp = await apiClient.get(`/api/v1/collaboration/rooms/${encodeURIComponent(roomId)}/programs`, {
    params: { limit },
  });
  const payload = unwrapPayload<{ items?: CollaborationProgramItem[] }>(resp.data);
  return payload?.items ?? [];
}

export async function confirmProgram(programId: string) {
  const resp = await apiClient.patch(`/api/v1/collaboration/programs/${encodeURIComponent(programId)}/confirm`);
  return unwrapPayload<{ program?: CollaborationProgramItem }>(resp.data);
}

export async function getRoom(roomId: string) {
  const resp = await apiClient.get(`/api/v1/collaboration/rooms/${encodeURIComponent(roomId)}`);
  return unwrapPayload<CollaborationRoom>(resp.data);
}

export async function updateRoomCollaborationMode(
  roomId: string,
  collaborationMode: CollaborationRoomCollaborationMode,
) {
  const resp = await apiClient.patch(`/api/v1/collaboration/rooms/${encodeURIComponent(roomId)}/collaboration-mode`, {
    collaborationMode,
  });
  return unwrapPayload<CollaborationRoom>(resp.data);
}

export async function listGoalCardsByRoom(roomId: string) {
  const resp = await apiClient.get(`/api/v1/tasks/goals/by-room/${roomId}`);
  const payload = unwrapPayload<{ items?: GoalCard[] }>(resp.data);
  return payload?.items ?? [];
}

/** 删除任务（网关 `DELETE /v1/tasks/:id` → `tasks.remove`；需公司管理员权限）。 */
export async function deleteTask(taskId: string) {
  const resp = await apiClient.delete(`/api/v1/tasks/${encodeURIComponent(taskId)}`);
  return unwrapPayload<{ ok?: boolean }>(resp.data);
}

export async function getAgentProfile(agentId: string) {
  const resp = await apiClient.get(`/api/v1/agents/${agentId}`);
  return unwrapPayload<AgentProfile>(resp.data);
}

export async function listRoomMembers(roomId: string) {
  const resp = await apiClient.get(`/api/v1/collaboration/rooms/${roomId}/members`);
  return unwrapPayload<RoomMember[]>(resp.data);
}

export async function getApprovalRecord(approvalId: string) {
  const resp = await apiClient.get(`/api/v1/approvals/${approvalId}`);
  return unwrapPayload<ApprovalRecord | null>(resp.data);
}

export type MainRoomDraftState = MainRoomDraftStateDto;

export async function getMainRoomDraftState(roomId: string, threadId?: string | null) {
  const resp = await apiClient.get(`/api/v1/collaboration/rooms/${encodeURIComponent(roomId)}/main-room-draft`, {
    params: threadId ? { threadId } : {},
  });
  return unwrapPayload<MainRoomDraftState>(resp.data);
}

export async function patchMainRoomStrategyGoalDraft(
  roomId: string,
  body: {
    strategyGoal: string;
    strategicPhases: Array<{ phaseId?: string; title: string; outcome: string; deadline?: string }>;
    threadId?: string | null;
  },
) {
  const resp = await apiClient.patch(
    `/api/v1/collaboration/rooms/${encodeURIComponent(roomId)}/main-room-draft/strategy-goal`,
    body,
  );
  return unwrapPayload<{ planning2026: unknown; legacyPlanning: unknown }>(resp.data);
}

export type MainRoomDispatchPlanState = import("@contracts/types").MainRoomDispatchPlanStateDto;

export async function getMainRoomDispatchPlanDraftState(roomId: string, threadId?: string | null) {
  const resp = await apiClient.get(
    `/api/v1/collaboration/rooms/${encodeURIComponent(roomId)}/dispatch-plan/draft`,
    { params: threadId ? { threadId } : {} },
  );
  return unwrapPayload<MainRoomDispatchPlanState>(resp.data);
}

export async function patchMainRoomDispatchPlanDraft(
  roomId: string,
  body: {
    goal: string;
    bodyMarkdown?: string;
    assignments: Array<{
      departmentSlug: string;
      title: string;
      objective: string;
      acceptanceCriteria?: string[];
      dependsOnSlugs?: string[];
      priority?: string;
    }>;
    executionOrder?: string;
    threadId?: string | null;
  },
) {
  const resp = await apiClient.patch(
    `/api/v1/collaboration/rooms/${encodeURIComponent(roomId)}/dispatch-plan/draft`,
    body,
  );
  return unwrapPayload<MainRoomDispatchPlanState>(resp.data);
}

export async function patchMainRoomDistributionDraft(
  roomId: string,
  body: {
    rows: Array<{ department: string; priority: string; deliverable: string }>;
    threadId?: string | null;
  },
) {
  const resp = await apiClient.patch(
    `/api/v1/collaboration/rooms/${encodeURIComponent(roomId)}/main-room-draft/distribution`,
    body,
  );
  return unwrapPayload<{ tasksPatched: number }>(resp.data);
}

/** 标记房间为已读（清除未读计数） */
export async function markRoomRead(roomId: string) {
  const resp = await apiClient.patch(`/api/v1/collaboration/rooms/${encodeURIComponent(roomId)}/read`);
  return unwrapPayload<{ ok: boolean; lastReadSeq: string }>(resp.data);
}

