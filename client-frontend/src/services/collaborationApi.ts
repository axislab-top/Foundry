import { apiClient } from './apiClient';
import { unwrapResponse } from './apiTypes';

/** Matches backend `ChatRoomType` */
export type ChatRoomType = 'main' | 'department' | 'task' | 'custom';

export type CollaborationMode = 'discussion' | 'direct' | 'execution' | 'approval_wait';

export interface ChatRoom {
  id: string;
  companyId?: string;
  roomType: ChatRoomType;
  name: string;
  organizationNodeId?: string | null;
  taskId?: string | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown> | null;
  collaborationMode?: CollaborationMode;
  messageSeq?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DiscussionThread {
  id: string;
  companyId?: string;
  roomId: string;
  title: string;
  status: 'open' | 'converged' | 'archived';
  collaborationMode?: CollaborationMode | null;
  langgraphThreadId?: string | null;
  roundCount?: number;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export type ChatSenderType = 'human' | 'agent';
export type ApiMessageType = 'text' | 'system' | 'tool_call' | 'stream_chunk';

export interface ChatMessage {
  id: string;
  companyId?: string;
  roomId: string;
  threadId?: string | null;
  seq?: string;
  senderType: ChatSenderType;
  senderId: string;
  messageType: ApiMessageType;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

export type RoomMemberType = 'human' | 'agent';

export interface RoomMember {
  id: string;
  companyId?: string;
  roomId: string;
  memberType: RoomMemberType;
  memberId: string;
  joinedAt?: string;
  leftAt?: string | null;
}

export const COLLAB_ROOMS_QUERY_KEY = 'collaboration' as const;

export function roomsQueryKey(companyId: string | null): readonly [typeof COLLAB_ROOMS_QUERY_KEY, 'rooms', string | null] {
  return [COLLAB_ROOMS_QUERY_KEY, 'rooms', companyId];
}

export async function listRooms(): Promise<ChatRoom[]> {
  const { data } = await apiClient.get<unknown>('/v1/collaboration/rooms');
  const raw = unwrapResponse<unknown>(data);
  return Array.isArray(raw) ? raw : [];
}

export async function findMainRoom(): Promise<ChatRoom | null> {
  const { data } = await apiClient.get<unknown>('/v1/collaboration/rooms/main');
  const raw = unwrapResponse<unknown>(data);
  return raw && typeof raw === 'object' ? (raw as ChatRoom) : null;
}

export async function getRoom(roomId: string): Promise<ChatRoom> {
  const { data } = await apiClient.get<unknown>(`/v1/collaboration/rooms/${roomId}`);
  return unwrapResponse<ChatRoom>(data);
}

export async function listMessages(
  roomId: string,
  params?: { limit?: number; beforeSeq?: number },
): Promise<{ items: ChatMessage[]; hasMore: boolean }> {
  const { data } = await apiClient.get<unknown>(`/v1/collaboration/rooms/${roomId}/messages`, {
    params,
  });
  const raw = unwrapResponse<{ items?: ChatMessage[]; hasMore?: boolean } | ChatMessage[]>(data);
  if (Array.isArray(raw)) {
    return { items: raw, hasMore: false };
  }
  return { items: raw.items ?? [], hasMore: raw.hasMore ?? false };
}

export async function listRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data } = await apiClient.get<unknown>(`/v1/collaboration/rooms/${roomId}/members`);
  const raw = unwrapResponse<unknown>(data);
  return Array.isArray(raw) ? (raw as RoomMember[]) : [];
}

export async function sendMessage(body: {
  roomId: string;
  content: string;
  messageType?: string;
  threadId?: string;
  metadata?: Record<string, unknown>;
}): Promise<ChatMessage> {
  const { data } = await apiClient.post<unknown>('/v1/collaboration/messages', body);
  return unwrapResponse<ChatMessage>(data);
}

export async function updateRoomCollaborationMode(
  roomId: string,
  collaborationMode: CollaborationMode,
  changeReason?: string,
): Promise<ChatRoom> {
  const { data } = await apiClient.patch<unknown>(
    `/v1/collaboration/rooms/${roomId}/collaboration-mode`,
    { collaborationMode, ...(changeReason ? { changeReason } : {}) },
  );
  return unwrapResponse<ChatRoom>(data);
}

export async function listDiscussionThreads(roomId: string): Promise<DiscussionThread[]> {
  const { data } = await apiClient.get<unknown>(`/v1/collaboration/rooms/${roomId}/threads`);
  const raw = unwrapResponse<unknown>(data);
  return Array.isArray(raw) ? (raw as DiscussionThread[]) : [];
}

export async function createDiscussionThread(
  roomId: string,
  body: { title?: string; collaborationMode?: CollaborationMode },
): Promise<DiscussionThread> {
  const { data } = await apiClient.post<unknown>(`/v1/collaboration/rooms/${roomId}/threads`, body);
  return unwrapResponse<DiscussionThread>(data);
}

export type CeoApprovalDecision = 'approved' | 'rejected' | 'modified';

export async function resolveCeoApproval(
  approvalId: string,
  decision: CeoApprovalDecision,
  note?: string,
): Promise<unknown> {
  const { data } = await apiClient.post<unknown>(
    `/v1/collaboration/ceo-approvals/${approvalId}/resolve`,
    { decision, note },
  );
  return unwrapResponse(data);
}
