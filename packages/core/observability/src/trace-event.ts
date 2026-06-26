/**
 * Append-only trace / run step shape (Postgres task_execution_logs + ClickHouse trace_events).
 */
export type TraceEventType =
  | 'agent_step'
  | 'llm_call'
  | 'tool_call'
  | 'rpc'
  | 'heartbeat'
  | 'error';

export interface TokenUsageSummary {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface RedactedHttpMetadata {
  method?: string;
  host?: string;
  path?: string;
  statusCode?: number;
}

export interface StructuredTraceError {
  name?: string;
  message: string;
  stack?: string;
}

export interface TraceEventPayload {
  eventType: TraceEventType;
  stepName?: string;
  toolName?: string;
  model?: string;
  durationMs?: number;
  tokenUsage?: TokenUsageSummary;
  http?: RedactedHttpMetadata;
  error?: StructuredTraceError;
  /** Small JSON-safe metadata (already redacted at source). */
  attributes?: Record<string, string | number | boolean | null>;
  /** Correlates trace events with ACP message lifecycle. */
  messageId?: string;
  agentMessage?: {
    fromAgentId: string;
    toAgentId: string;
    intent: string;
  };
}

export interface RunStepRecorded extends TraceEventPayload {
  companyId: string;
  runId: string;
  taskId?: string;
  agentId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  sourceService: string;
  recordedAt: string;
}
