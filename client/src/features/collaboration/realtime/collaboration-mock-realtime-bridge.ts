/** MOCK 路径：用 CustomEvent 模拟协作 WS 事件，shape 对齐生产 Gateway。 */
export const COLLABORATION_MOCK_REALTIME_EVENT = 'foundry:collaboration-mock-realtime';

export type CollaborationMockRealtimeEnvelope =
  | { type: 'responder:thinking'; payload: unknown }
  | { type: 'message:chunk'; payload: unknown }
  | { type: 'message:new'; payload: unknown }
  | { type: 'message:metadata_updated'; payload: unknown }
  | { type: 'dispatch:partial_failed'; payload: unknown }
  | { type: 'orchestration:updated'; payload: unknown };

export function emitCollaborationMockRealtime(envelope: CollaborationMockRealtimeEnvelope): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COLLABORATION_MOCK_REALTIME_EVENT, { detail: envelope }));
}

export type CollaborationMockRealtimeHandlers = {
  onResponderThinking?: (payload: unknown) => void;
  onMessageChunk?: (payload: unknown) => void;
  onMessageNew?: (payload: unknown) => void;
  onMessageMetadataUpdated?: (payload: unknown) => void;
  onDispatchPartialFailed?: (payload: unknown) => void;
  onOrchestrationUpdated?: (payload: unknown) => void;
};

export function attachCollaborationMockRealtimeBridge(
  handlers: CollaborationMockRealtimeHandlers,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const fn = (ev: Event) => {
    const detail = (ev as CustomEvent<CollaborationMockRealtimeEnvelope>).detail;
    if (!detail || typeof detail !== 'object') return;
    switch (detail.type) {
      case 'responder:thinking':
        handlers.onResponderThinking?.(detail.payload);
        break;
      case 'message:chunk':
        handlers.onMessageChunk?.(detail.payload);
        break;
      case 'message:new':
        handlers.onMessageNew?.(detail.payload);
        break;
      case 'message:metadata_updated':
        handlers.onMessageMetadataUpdated?.(detail.payload);
        break;
      case 'dispatch:partial_failed':
        handlers.onDispatchPartialFailed?.(detail.payload);
        break;
      case 'orchestration:updated':
        handlers.onOrchestrationUpdated?.(detail.payload);
        break;
      default:
        break;
    }
  };
  window.addEventListener(COLLABORATION_MOCK_REALTIME_EVENT, fn);
  return () => window.removeEventListener(COLLABORATION_MOCK_REALTIME_EVENT, fn);
}
