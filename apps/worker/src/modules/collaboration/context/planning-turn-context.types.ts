/**
 * JSON-safe slice of {@link CollaborationExecutionContext} for Temporal workflow args
 * and cross-process L1 planning input (no `Date` — use ISO string).
 */
export type PlanningTurnMemoryHitSerializable = {
  id?: string;
  content?: string;
  score?: number;
  namespace?: string;
  sourceType?: string;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
};

export type PlanningTurnContextSerializable = {
  traceId: string;
  memoryHits: PlanningTurnMemoryHitSerializable[];
  /** ISO 8601 — replaces `CollaborationExecutionContext.retrievedAt` on the wire */
  retrievedAtIso: string;
  leadMemorySearchDone?: boolean;
  leadPromptContext?: string;
  transcriptSnapshotForTurn?: string;
  orgSnapshotRevision?: string;
};
