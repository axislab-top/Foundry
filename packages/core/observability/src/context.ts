/**
 * Cross-service correlation fields (Gateway → API → Worker → logs / ClickHouse).
 */
export interface ObservabilityContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  messageId?: string;
  runId?: string;
  taskId?: string;
  companyId?: string;
  agentId?: string;
}

export function pickObservabilityContext(
  partial: Partial<ObservabilityContext>,
): ObservabilityContext {
  const out: ObservabilityContext = {};
  if (partial.requestId != null) out.requestId = partial.requestId;
  if (partial.traceId != null) out.traceId = partial.traceId;
  if (partial.spanId != null) out.spanId = partial.spanId;
  if (partial.messageId != null) out.messageId = partial.messageId;
  if (partial.runId != null) out.runId = partial.runId;
  if (partial.taskId != null) out.taskId = partial.taskId;
  if (partial.companyId != null) out.companyId = partial.companyId;
  if (partial.agentId != null) out.agentId = partial.agentId;
  return out;
}
