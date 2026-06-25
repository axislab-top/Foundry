import type { CollaborationMessage } from "../api/collaborationApi";

/** 保留 WS 流式虚拟消息，过滤历史中的 provisional stream_chunk。 */
export function mergeRoomMessagesWithActiveStreams(
  persisted: CollaborationMessage[],
  active: CollaborationMessage[],
): CollaborationMessage[] {
  const streamingVirtual = active.filter((m) => {
    if (!m.id.startsWith("stream:")) return false;
    const meta = m.metadata && typeof m.metadata === "object" ? m.metadata : null;
    return Boolean(meta && (meta as { isStreaming?: boolean }).isStreaming);
  });
  if (!streamingVirtual.length) return persisted;
  const merged = [...persisted];
  for (const vm of streamingVirtual) {
    if (!merged.some((m) => m.id === vm.id)) merged.push(vm);
  }
  return merged;
}

export function isProvisionalStreamChunk(message: CollaborationMessage): boolean {
  if (message.messageType !== "stream_chunk") return false;
  const meta = message.metadata && typeof message.metadata === "object" ? message.metadata : null;
  return Boolean(meta && (meta as { provisional?: boolean }).provisional !== false);
}

export function normalizePersistedRoomMessages(rows: CollaborationMessage[]): CollaborationMessage[] {
  return rows.filter((m) => !isProvisionalStreamChunk(m));
}
