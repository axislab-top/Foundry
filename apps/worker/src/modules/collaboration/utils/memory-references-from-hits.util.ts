import type { MemoryReference } from '@contracts/types';

/** 将 API `memory.search` 命中行映射为下游 Graph / 审计用的结构化引用 */
export function memoryReferencesFromSearchHits(hits: unknown): MemoryReference[] {
  if (!Array.isArray(hits)) return [];
  const out: MemoryReference[] = [];
  for (const raw of hits.slice(0, 24)) {
    if (!raw || typeof raw !== 'object') continue;
    const h = raw as Record<string, unknown>;
    const id = typeof h.id === 'string' ? h.id.trim() : '';
    if (!id) continue;
    const content = typeof h.content === 'string' ? h.content : '';
    out.push({
      memoryEntryId: id,
      score: typeof h.score === 'number' ? h.score : undefined,
      namespace: typeof h.namespace === 'string' ? h.namespace : undefined,
      sourceType: typeof h.sourceType === 'string' ? h.sourceType : undefined,
      snippet: content ? content.slice(0, 480) : undefined,
      createdAt: typeof h.createdAt === 'string' ? h.createdAt : undefined,
    });
  }
  return out;
}
