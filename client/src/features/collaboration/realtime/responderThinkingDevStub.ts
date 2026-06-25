export type ResponderThinkingStubPayload = {
  sourceMessageId: string;
  status: "routing" | "thinking" | "idle";
  responderAgentIds: string[];
  ceoLayer?: string;
  startedAt: string;
};

/** DEV/MOCK：本地模拟 responder:thinking 序列（无后端 WS 时验证 UI）。 */
export function simulateResponderThinkingSequence(params: {
  sourceMessageId: string;
  responderAgentId?: string;
  onPayload: (payload: ResponderThinkingStubPayload) => void;
}): void {
  const startedAt = new Date().toISOString();
  const agentId = params.responderAgentId ?? "agent-001";

  window.setTimeout(() => {
    params.onPayload({
      sourceMessageId: params.sourceMessageId,
      status: "routing",
      responderAgentIds: [],
      startedAt,
    });
  }, 120);

  window.setTimeout(() => {
    params.onPayload({
      sourceMessageId: params.sourceMessageId,
      status: "thinking",
      responderAgentIds: [agentId],
      ceoLayer: "L2",
      startedAt,
    });
  }, 650);
}

export function isResponderThinkingDevStubEnabled(): boolean {
  const raw = import.meta.env.VITE_MOCK_RESPONDER_THINKING;
  if (raw == null || String(raw).trim() === "") {
    return import.meta.env.DEV;
  }
  return !["0", "false", "no", "off"].includes(String(raw).trim().toLowerCase());
}
