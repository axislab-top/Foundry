/**
 * 主群协作 threadId 约定（API / Worker / Client / E2E 共用）。
 *
 * - Redis 会话键使用 sentinel `main` 表示默认主会话（非 UUID）。
 * - 讨论串创建后 threadId 为 UUID；读会话时若 UUID 桶无数据可回退 `main`。
 */

export const MAIN_ROOM_THREAD_SENTINEL = 'main' as const;

export type MainRoomThreadSentinel = typeof MAIN_ROOM_THREAD_SENTINEL;

/** 合法 threadId：空 / main / UUID v4 */
export const COLLABORATION_THREAD_ID_PATTERN =
  /^(?:main|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

/**
 * 规范化 threadId 为 Redis 键段（永不返回空串）。
 */
export function normalizeCollaborationThreadId(threadId?: string | null): string {
  const raw = String(threadId ?? '').trim();
  if (!raw || raw.toLowerCase() === MAIN_ROOM_THREAD_SENTINEL) {
    return MAIN_ROOM_THREAD_SENTINEL;
  }
  return raw;
}

export function isCollaborationThreadId(value: unknown): value is string {
  const s = String(value ?? '').trim();
  if (!s) return true;
  return COLLABORATION_THREAD_ID_PATTERN.test(s);
}

/**
 * 读 Redis 会话时的 thread 候选顺序：先请求 thread，再（若非 main）回退 main。
 */
export function collaborationThreadReadCandidates(threadId?: string | null): string[] {
  const primary = normalizeCollaborationThreadId(threadId);
  if (primary === MAIN_ROOM_THREAD_SENTINEL) return [primary];
  return [primary, MAIN_ROOM_THREAD_SENTINEL];
}
