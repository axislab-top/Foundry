import { collaborationThreadReadCandidates, MAIN_ROOM_THREAD_SENTINEL } from './collab-thread-id.js';

export type CollabSessionResolvedVia = 'thread' | 'main_fallback' | 'none';

export type CollabSessionReadResult<T> = {
  value: T | null;
  /** 实际命中 Redis 的 threadId */
  resolvedThreadId: string;
  /** 会话解析方式（供 Draft API / E2E 断言） */
  resolvedVia: CollabSessionResolvedVia;
};

/**
 * 按 thread 候选顺序读取协作 Redis 会话（先 primary，再 main 回退）。
 * `strictThreadIsolation=true` 时 UUID thread 不回退 main（避免新讨论串读到旧主会话）。
 */
export async function readCollabSessionWithThreadFallback<T>(params: {
  threadId?: string | null;
  strictThreadIsolation?: boolean;
  read: (normalizedThreadId: string) => Promise<T | null>;
}): Promise<CollabSessionReadResult<T>> {
  const candidates = collaborationThreadReadCandidates(params.threadId);
  const primary = candidates[0]!;
  const strict = params.strictThreadIsolation === true;
  const tryIds =
    strict && primary !== MAIN_ROOM_THREAD_SENTINEL ? [primary] : candidates;

  for (let i = 0; i < tryIds.length; i++) {
    const tid = tryIds[i]!;
    const value = await params.read(tid);
    if (value != null) {
      const resolvedVia: CollabSessionResolvedVia = tid === primary ? 'thread' : 'main_fallback';
      return { value, resolvedThreadId: tid, resolvedVia };
    }
  }
  return { value: null, resolvedThreadId: primary, resolvedVia: 'none' };
}

/** 会话 sourceMessageId 与当前消息不一致时，路由层视为无会话（避免旧 plan 误触发 flush）。 */
export function isCollabSessionBoundToMessage(params: {
  sessionSourceMessageId?: string | null;
  messageId?: string | null;
  /** pending 确认态允许跨消息确认下发 */
  allowPendingConfirm?: boolean;
  pendingDistributionConfirm?: boolean;
}): boolean {
  const bound = String(params.sessionSourceMessageId ?? '').trim();
  const msgId = String(params.messageId ?? '').trim();
  if (!bound || !msgId) return true;
  if (bound === msgId) return true;
  if (params.allowPendingConfirm && params.pendingDistributionConfirm === true) return true;
  return false;
}

/** 超过此时间仍为 running 的 orchestration run 视为 stale（默认 30 分钟）。 */
export const DEFAULT_ORCHESTRATION_RUN_STALE_MS = 30 * 60 * 1000;

export function isOrchestrationRunStale(
  updatedAt: Date | string,
  staleMs = DEFAULT_ORCHESTRATION_RUN_STALE_MS,
  nowMs = Date.now(),
): boolean {
  const ts = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(String(updatedAt));
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts > staleMs;
}
