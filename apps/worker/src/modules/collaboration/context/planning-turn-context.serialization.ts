import type { CollaborationExecutionContext } from './collaboration-execution-context.js';
import type { PlanningTurnContextSerializable } from './planning-turn-context.types.js';

/** Turn 上下文写入 Temporal workflow / Activity payload（纯 JSON）。 */
export function serializePlanningTurnContext(ctx: CollaborationExecutionContext): PlanningTurnContextSerializable {
  const retrievedAt = ctx.retrievedAt instanceof Date ? ctx.retrievedAt : new Date();
  return {
    traceId: String(ctx.traceId ?? '').trim(),
    memoryHits: Array.isArray(ctx.memoryHits) ? ctx.memoryHits.map((h) => ({ ...h })) : [],
    retrievedAtIso: retrievedAt.toISOString(),
    leadMemorySearchDone: ctx.leadMemorySearchDone === true,
    leadPromptContext:
      typeof ctx.leadPromptContext === 'string' && ctx.leadPromptContext.trim()
        ? ctx.leadPromptContext.trim().slice(0, 12_000)
        : undefined,
    transcriptSnapshotForTurn:
      typeof ctx.transcriptSnapshotForTurn === 'string' && ctx.transcriptSnapshotForTurn.trim()
        ? ctx.transcriptSnapshotForTurn.trim().slice(0, 4500)
        : undefined,
    orgSnapshotRevision: typeof ctx.orgSnapshotRevision === 'string' ? ctx.orgSnapshotRevision.slice(0, 256) : undefined,
  };
}

/** Activity 侧还原为 {@link CollaborationExecutionContext}（供 L1 metadata）。 */
export function deserializePlanningTurnContext(
  row: PlanningTurnContextSerializable | null | undefined,
): CollaborationExecutionContext | null {
  if (!row || typeof row !== 'object') return null;
  const traceId = String(row.traceId ?? '').trim();
  if (!traceId) return null;
  const hits = Array.isArray(row.memoryHits) ? row.memoryHits : [];
  const iso = String(row.retrievedAtIso ?? '').trim();
  return {
    traceId,
    memoryHits: hits.map((h) => ({ ...h })),
    retrievedAt: iso ? new Date(iso) : new Date(),
    leadMemorySearchDone: row.leadMemorySearchDone === true,
    leadPromptContext: row.leadPromptContext,
    transcriptSnapshotForTurn: row.transcriptSnapshotForTurn,
    orgSnapshotRevision: row.orgSnapshotRevision,
  };
}
