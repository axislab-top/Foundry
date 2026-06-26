/** Memory 检索跳过原因（日志/指标枚举，避免自由字符串漂移） */
export type MemoryRetrievalSkipReason = 'duplicate' | 'phase' | 'policy' | 'unknown';

export function normalizeMemoryRetrievalSkipReason(raw: string | undefined): MemoryRetrievalSkipReason {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'duplicate' || s === 'orchestration_assemble') return 'duplicate';
  if (s === 'phase') return 'phase';
  if (s === 'policy') return 'policy';
  return 'unknown';
}
