export interface CompensationEvent {
  traceId: string;
  action: string;
  reason: string;
  occurredAt: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export function createCompensationEvent(params: {
  traceId: string;
  action: string;
  reason: string;
  metadata?: Record<string, unknown>;
}): CompensationEvent {
  return {
    traceId: params.traceId,
    action: params.action,
    reason: params.reason,
    occurredAt: new Date().toISOString(),
    timestamp: Date.now(),
    metadata: params.metadata,
  };
}
